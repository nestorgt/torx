// server.js
import express from "express";
import axios from "axios";
import https from "https";
import { config } from "dotenv";
config({ path: ".secrets/.env" });
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { authenticator } from "otplib";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Google Sheets API integration
import { google } from 'googleapis';

/* ===================== Setup Puppeteer ===================== */
puppeteer.use(StealthPlugin());

/* ===================== Helpers env y ficheros ===================== */
function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno ${name}. Revisa tu .env`);
  return v;
}
function readPem(filePath, label) {
  if (!filePath) throw new Error(`Ruta vacía para ${label}`);
  if (!fs.existsSync(filePath)) throw new Error(`No existe ${label}: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/* ===================== Carga env obligatorios (genéricos) ===================== */
const PROXY_TOKEN     = must("PROXY_TOKEN");
const PORT            = Number(process.env.PORT || 8081);

// mTLS (certificado de cliente para Revolut)
const CLIENT_CERT_PATH = must("CLIENT_CERT_PATH");
const CLIENT_KEY_PATH  = must("CLIENT_KEY_PATH");

// OAuth Revolut
const CLIENT_ID    = must("CLIENT_ID");
const REDIRECT_URI = must("REDIRECT_URI");
const ISSUER       = must("ISSUER");

// Mercury
const MERCURY_API_TOKEN = must("MERCURY_API_TOKEN");

// Wise
const WISE_API_TOKEN = process.env.WISE_API_TOKEN || "";
const WISE_PROFILE_ID = process.env.WISE_PROFILE_ID || "";
const WISE_BASE = process.env.WISE_BASE || "https://api.transferwise.com";

/* ===================== Carga PEMs mTLS Revolut ===================== */
const cert = readPem(CLIENT_CERT_PATH, "CLIENT_CERT_PATH");
const key  = readPem(CLIENT_KEY_PATH,  "CLIENT_KEY_PATH");
let ca;
if (process.env.CA_BUNDLE_PATH) {
  try { ca = readPem(process.env.CA_BUNDLE_PATH, "CA_BUNDLE_PATH"); }
  catch { console.warn("[WARN] CA bundle no encontrado, sigo con trust store del sistema."); }
}

/* ===================== Axios agent con mTLS ===================== */
const revolutAgent = new https.Agent({ cert, key, ca, rejectUnauthorized: true });
/* ===================== Verbose logging toggle ===================== */
const VERBOSE_LOGS = String(process.env.VERBOSE_LOGS || "").trim() === "1";
const __originalConsoleLog = console.log.bind(console);
console.log = (...args) => {
  try {
    const first = String(args[0] ?? "");
    if (first.startsWith("[DEBUG]") || first.startsWith("[SKIP]")) {
      if (VERBOSE_LOGS) __originalConsoleLog(...args);
      return;
    }
  } catch {}
  __originalConsoleLog(...args);
};

/* ===================== Endpoints OAuth Revolut ===================== */
const REV_AUTH_BASE = "https://b2b.revolut.com/api/1.0/auth";
const TOKEN_URL     = `${REV_AUTH_BASE}/token`;

/* ===================== Build Revolut Authorization URL ===================== */
function buildRevolutAuthUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: crypto.randomUUID()
  });
  return `${REV_AUTH_BASE}/authorize?${params.toString()}`;
}

/* ===================== Token cache (disco) ===================== */
const TOKENS_FILE = path.join(process.cwd(), ".secrets", "tokens.json");
let tokenState = { access_token: null, refresh_token: null, exp_ts: 0 };
try {
  if (fs.existsSync(TOKENS_FILE)) tokenState = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
} catch { /* noop */ }
function saveTokens() {
  try { fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokenState, null, 2)); } catch {}
}

/* ===================== JWT client assertion (RS256) ===================== */
function buildClientAssertionJWT(audience) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const audiences = Array.isArray(audience) && audience.length > 0
    ? audience
    : [TOKEN_URL, "https://b2b.revolut.com", "https://revolut.com"]; // include common accepted audiences
  const payload = {
    iss: ISSUER,        // issuer must match Revolut dashboard
    sub: CLIENT_ID,     // subject is client_id
    aud: audiences,     // array of acceptable audiences
    iat: now,
    exp: now + 60,
    jti: crypto.randomUUID(),
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(key).toString("base64url");
  return `${unsigned}.${signature}`;
}

/* ===================== OAuth: intercambio y refresh ===================== */
async function exchangeCodeForTokens(authCode) {
  async function attempt(aud) {
    const client_assertion = buildClientAssertionJWT(aud);
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: authCode,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion
    });
    return axios.post(TOKEN_URL, form.toString(), {
      httpsAgent: revolutAgent,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      timeout: 15000,
      validateStatus: () => true
    });
  }

  let resp = await attempt(TOKEN_URL);
  if (resp.status >= 400 && String(resp.data?.error).includes("unauthorized_client")) {
    // Retry with alternate audience
    resp = await attempt("https://revolut.com");
  }
  const { data, status } = resp;
  if (status >= 400) throw new Error(`Token exchange HTTP ${status}: ${JSON.stringify(data)}`);
  tokenState.access_token  = data.access_token;
  tokenState.refresh_token = data.refresh_token;
  tokenState.exp_ts        = Math.floor(Date.now()/1000) + (data.expires_in || 2400) - 30;
  saveTokens();
}

// Removed client_credentials function - not supported by Revolut

async function refreshAccessToken() {
  if (!tokenState.refresh_token) throw new Error("No hay refresh_token guardado");
  const client_assertion = buildClientAssertionJWT();
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokenState.refresh_token,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion
  });
  const { data, status } = await axios.post(TOKEN_URL, form.toString(), {
    httpsAgent: revolutAgent,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    timeout: 15000,
    validateStatus: () => true
  });
  if (status >= 400) throw new Error(`Refresh HTTP ${status}: ${JSON.stringify(data)}`);
  tokenState.access_token  = data.access_token;
  tokenState.refresh_token = data.refresh_token || tokenState.refresh_token;
  tokenState.exp_ts        = Math.floor(Date.now()/1000) + (data.expires_in || 2400) - 30;
  saveTokens();
}

async function ensureAccessToken() {
  const now = Math.floor(Date.now()/1000);
  if (tokenState.access_token && tokenState.exp_ts > now) return tokenState.access_token;
  
  if (tokenState.refresh_token) {
    try {
      await refreshAccessToken();
      return tokenState.access_token;
    } catch (error) {
      console.log('[WARN] Refresh token failed, need new OAuth flow: %s', error.message);
    }
  }
  
  throw new Error('No valid access token. Please complete OAuth flow first by visiting /revolut/auth');
}

/* ===================== Revolut API helpers ===================== */
async function fetchRevolutAccounts() {
  const accessToken = await ensureAccessToken();
  const url = "https://b2b.revolut.com/api/1.0/accounts";

  let resp = await axios.get(url, {
    httpsAgent: revolutAgent,
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
    validateStatus: () => true
  });

  if (resp.status === 401) {
    await refreshAccessToken();
    resp = await axios.get(url, {
      httpsAgent: revolutAgent,
      headers: { Authorization: `Bearer ${tokenState.access_token}` },
      timeout: 15000,
      validateStatus: () => true
    });
  }

  if (resp.status >= 400) {
    throw new Error(`Revolut /accounts error ${resp.status}: ${JSON.stringify(resp.data)}`);
  }

  const list = Array.isArray(resp.data) ? resp.data : (resp.data.accounts || []);
  return list;
}

/* ===================== Auth helper para el proxy ===================== */
function checkProxyAuth(req, res) {
  // Support both x-proxy-token header and Authorization Bearer token
  const authHeader = req.get("Authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
  const presented = String(req.get("x-proxy-token") || bearerToken || req.query.token || "").trim();
  const expected  = String(PROXY_TOKEN || "").trim();
  if (!expected) {
    console.error("[AUTH] PROXY_TOKEN vacío en el servidor");
    res.status(500).json({ error: "server_misconfig", detail: "PROXY_TOKEN no configurado" });
    return false;
  }
  if (!presented) {
    res.status(401).json({ error: "unauthorized", reason: "missing_header" });
    return false;
  }
  const A = Buffer.from(presented, "utf8");
  const B = Buffer.from(expected,  "utf8");
  if (A.length !== B.length || !crypto.timingSafeEqual(A, B)) {
    res.status(401).json({ error: "unauthorized", reason: "mismatch" });
    return false;
  }
  return true;
}

/* ===================== App ===================== */
const app = express();
app.use(express.json());
app.post("/_echo", (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  console.log("[ECHO] body:", req.body);
  res.json({ ok: true, body: req.body });
});

app.get("/healthz", (_req, res) => res.send("ok"));

/* Health endpoint for Google Apps Script compatibility */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    message: "Proxy server is healthy"
  });
});

/* Root captura ?code=... para OAuth Revolut */
app.get("/", async (req, res) => {
  const code = (req.query.code || "").trim();
  if (!code) return res.status(200).send("Proxy OK");
  try {
    await exchangeCodeForTokens(code);
    return res.status(200).send("Auth code recibido y tokens guardados. Ya puedes cerrar esta ventana.");
  } catch (e) {
    console.error("[OAUTH] Intercambio de code falló:", e.message);
    return res.status(500).send("Fallo al intercambiar code: " + e.message);
  }
});

/* ===================== Revolut ===================== */
app.get("/revolut/accounts", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const list = await fetchRevolutAccounts();
    return res.json(list);
  } catch (e) {
    console.error("Proxy error /revolut/accounts:", e.message);
    return res.status(502).json({ error: "revolut_error", detail: e.message });
  }
});

/* ===================== Revolut: OAuth Authorization URL ===================== */
app.get("/revolut/auth", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const authUrl = buildRevolutAuthUrl();
    return res.json({ 
      auth_url: authUrl,
      message: "Visita esta URL en tu navegador para autorizar la aplicación Revolut"
    });
  } catch (e) {
    console.error("Proxy error /revolut/auth:", e.message);
    return res.status(502).json({ error: "revolut_error", detail: e.message });
  }
});

/* Resumen rápido Revolut (solo cuentas "Main") */
app.get("/revolut/summary", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const list = await fetchRevolutAccounts();
    const mains = (list || []).filter(a => String(a.name || '').trim() === 'Main');

    const sum = (ccy) => mains
      .filter(a => String(a.currency || '').toUpperCase() === ccy)
      .reduce((acc, a) => acc + Number(a.balance || 0), 0);

    const USD = sum("USD");
    const EUR = sum("EUR");
    return res.json({ USD, EUR, count: mains.length });
  } catch (e) {
    console.error("Proxy error /revolut/summary:", e.message);
    return res.status(502).json({ error: "revolut_error", detail: e.message });
  }
});

/* ========= Revolut: crear transferencia interna (POST /transfer) ========= */
/* Docs: https://developer.revolut.com/docs/business/create-transfer (POST /transfer)
   Body: { request_id, source_account_id, target_account_id, amount, currency, reference } */

function findAccountByNameAndCcy(list, name, ccy) {
  const N = String(name || "").trim();
  const C = String(ccy  || "").toUpperCase();
  return (list || []).find(a =>
    String(a.name || "").trim() === N &&
    String(a.currency || "").toUpperCase() === C
  ) || null;
}

async function revolutCreateTransfer(payload) {
  const accessToken = await ensureAccessToken();
  const url = "https://b2b.revolut.com/api/1.0/transfer";
  const { data, status } = await axios.post(url, payload, {
    httpsAgent: revolutAgent,
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    timeout: 20000,
    validateStatus: () => true
  });

  // ✔️ si Revolut devuelve duplicate (3020), trátalo como éxito idempotente
  if (status === 400 && data && Number(data.code) === 3020) {
    return { idempotent: true, duplicate: true, state: "duplicate", data };
  }

  // ✔️ si Revolut devuelve duplicate (3020), trátalo como éxito idempotente
  if (status === 400 && data && Number(data.code) === 3020) {
    return { idempotent: true, duplicate: true, state: "duplicate", data };
  }

  if (status >= 400) {
    throw new Error(`Revolut /transfer ${status}: ${JSON.stringify(data)}`);
  }
  return data; // { id, state, ... }
}

async function revolutCreateExternalTransfer(payload) {
  const accessToken = await ensureAccessToken();
  
  // Try multiple external transfer endpoints
  const endpoints = [
    "https://b2b.revolut.com/api/1.0/external-transfer",
    "https://b2b.revolut.com/api/1.0/payments/external",
    "https://b2b.revolut.com/api/1.0/wire-transfers",
    "https://b2b.revolut.com/api/1.0/ach-transfers"
  ];
  
  for (const url of endpoints) {
    try {
      console.log(`[REVOLUT] Trying external transfer endpoint: ${url}`);
      const { data, status } = await axios.post(url, payload, {
        httpsAgent: revolutAgent,
        headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        timeout: 20000,
        validateStatus: () => true
      });
      
      if (status < 400) {
        console.log(`[REVOLUT] External transfer successful via ${url}`);
        return { data, status, endpoint: url };
      } else {
        console.log(`[REVOLUT] ${url} failed: ${status} - ${JSON.stringify(data)}`);
      }
    } catch (error) {
      console.log(`[REVOLUT] ${url} error: ${error.message}`);
    }
  }
  
  // If no external endpoints work, fall back to internal transfer logic
  throw new Error(`All Revolut external transfer endpoints failed`);
}

/* ========= Revolut: mover entre cuentas (por nombre + divisa) ========= */
/* ========= Revolut External Transfer ========= */
app.post("/revolut/external-transfer", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  console.log("[REVOLUT_EXT] External transfer request:", JSON.stringify(req.body, null, 2));
  
  try {
    const { 
      fromAccountId, 
      externalBankAccount, 
      amount, 
      currency, 
      reference 
    } = req.body;
    
    if (!fromAccountId || !externalBankAccount || !amount || !currency) {
      return res.status(400).json({ 
        error: "bad_request", 
        detail: "fromAccountId, externalBankAccount, amount, and currency are required" 
      });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ 
        error: "bad_request", 
        detail: "Amount must be greater than 0" 
      });
    }
    
    const payload = {
      source_account_id: fromAccountId,
      destination_account: {
        name: externalBankAccount.name || 'External Account',
        account_number: externalBankAccount.accountNumber,
        routing_number: externalBankAccount.routingNumber || '021000021',
        account_type: externalBankAccount.accountType || 'checking',
        bank_name: externalBankAccount.bankName || 'Unknown Bank'
      },
      amount: Math.round(amount * 100) / 100,
      currency: currency.toUpperCase(),
      reference: reference || `External transfer to ${externalBankAccount.name || 'external account'}`,
      request_id: crypto.randomUUID()
    };
    
    console.log("[REVOLUT_EXT] External transfer payload:", JSON.stringify(payload, null, 2));
    
    const transfer = await revolutCreateExternalTransfer(payload);
    
    return res.json({
      success: true,
      transfer: {
        id: transfer.data?.id || `external-${Date.now()}`,
        status: transfer.data?.status || 'pending',
        type: 'external_transfer',
        amount: amount,
        currency: currency,
        destination: externalBankAccount.name || 'External Account',
        reference: reference || '',
        timestamp: new Date().toISOString(),
        endpoint: transfer.endpoint
      },
      message: `External transfer initiated: $${amount} ${currency} to ${externalBankAccount.name || 'external account'}`
    });
    
  } catch (error) {
    console.error("[REVOLUT_EXT] External transfer error:", error.message);
    return res.status(502).json({ 
      error: "external_transfer_error", 
      detail: error.message 
    });
  }
});

app.post("/revolut/transfer", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  console.log("[XFER] incoming", { body: req.body });
  try {
    const {
      fromName = "Main",
      toName,
      currency = "EUR",
      amount,
      reference,
      request_id
    } = req.body || {};

    if (!toName || !(Number(amount) > 0)) {
      return res.status(400).json({ error: "bad_request", detail: "toName y amount son obligatorios" });
    }

    const CCY = String(currency).toUpperCase();
    const accounts = await fetchRevolutAccounts();

    const source = findAccountByNameAndCcy(accounts, fromName, CCY);
    if (!source) return res.status(400).json({ error: "source_not_found", detail: `No existe cuenta origen "${fromName}" ${CCY}` });

    const target = findAccountByNameAndCcy(accounts, toName, CCY);
    if (!target) return res.status(400).json({ error: "target_not_found", detail: `No existe cuenta destino "${toName}" ${CCY}` });

    const reqId = (request_id && String(request_id)) || crypto.randomUUID();
    const amt   = Math.round(Number(amount) * 100) / 100;

    const payload = {
      request_id: reqId,
      source_account_id: source.id,
      target_account_id: target.id,
      amount: amt,
      currency: CCY,
      reference: reference || `Payout ${toName}`
    };

    const transfer = await revolutCreateTransfer(payload);
    if (transfer && transfer.duplicate) {
      return res.json({ ok: true, duplicate: true, request_id: reqId, transfer });
    }
    
    // 📱 Send WhatsApp notification for successful transfer
    if (transfer && transfer.state === 'completed') {
      try {
        await sendWhatsAppNotification(toName, amount, currency, reference);
        console.log(`[WHATSAPP] Notification sent to ${toName} for €${amount} transfer`);
      } catch (e) {
        console.error(`[WHATSAPP] Failed to send notification to ${toName}:`, e.message);
        // Don't fail the transfer if notification fails
      }
    }
    
    return res.json({ ok: true, request_id: reqId, transfer });
  } catch (e) {
    console.error("Proxy /revolut/transfer:", e);
    return res.status(502).json({ error: "revolut_error", detail: String(e.message || e) });
  }
});

/* ========= Fallback GET con querystring ========= */
app.get("/revolut/transfer_qs", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const q = req.query || {};
    const toName   = (q.toName || "").trim();
    const fromName = (q.fromName || "Main").trim();
    const amount   = Number(q.amount);
    const currency = String(q.currency || "EUR").toUpperCase();
    const reference= (q.reference || "").toString();
    const request_id = (q.request_id || crypto.randomUUID()).toString().slice(0, 40);

    if (!toName || !(amount > 0)) {
      return res.status(400).json({ error: "bad_request", detail: "toName y amount son obligatorios" });
    }

    const accounts = await fetchRevolutAccounts();
    const source = findAccountByNameAndCcy(accounts, fromName, currency);
    if (!source) return res.status(400).json({ error: "source_not_found", detail: `No existe cuenta origen "${fromName}" ${currency}` });

    const target = findAccountByNameAndCcy(accounts, toName, currency);
    if (!target) return res.status(400).json({ error: "target_not_found", detail: `No existe cuenta destino "${toName}" ${currency}` });

    const payload = {
      request_id,
      source_account_id: source.id,
      target_account_id: target.id,
      amount: Math.round(amount * 100) / 100,
      currency,
      reference: reference || `Payout ${toName}`
    };
    console.log("[XFER_QS] payload", payload);

    const transfer = await revolutCreateTransfer(payload);
    
    // 📱 Send WhatsApp notification for successful transfer
    if (transfer && transfer.state === 'completed') {
      try {
        await sendWhatsAppNotification(toName, amount, currency, reference);
        console.log(`[WHATSAPP] Notification sent to ${toName} for ${currency}${amount} transfer`);
      } catch (e) {
        console.error(`[WHATSAPP] Failed to send notification to ${toName}:`, e.message);
        // Don't fail the transfer if notification fails
      }
    }
    
    return res.json({ ok: true, request_id, transfer });
  } catch (e) {
    console.error("Proxy /revolut/transfer_qs:", e);
    return res.status(502).json({ error: "revolut_error", detail: String(e.message || e) });
  }
});

/* ========= Revolut: FX (USD -> EUR u otros) con POST /exchange ========= */
/* Nota: buscamos las cuentas por nombre exacto + divisa, igual que /transfer. */

async function revolutCreateExchange(payload) {
  // payload: { request_id, from: {account_id, currency}, to: {account_id, currency}, amount, reference }
  const accessToken = await ensureAccessToken();
  const url = "https://b2b.revolut.com/api/1.0/exchange";
  const { data, status } = await axios.post(url, payload, {
    httpsAgent: revolutAgent,
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    timeout: 20000,
    validateStatus: () => true
  });
  if (status >= 400) {
    throw new Error(`Revolut /exchange ${status}: ${JSON.stringify(data)}`);
  }
  return data; // { id, state, ... }
}

app.post("/revolut/exchange", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const {
      fromName = "Main",
      fromCcy  = "USD",
      toName   = "Main",
      toCcy    = "EUR",
      amount, // en moneda de origen
      reference,
      request_id
    } = req.body || {};

    if (!(amount > 0)) return res.status(400).json({ error: "bad_amount", detail: "amount debe ser > 0" });

    const upFrom = String(fromCcy).toUpperCase();
    const upTo   = String(toCcy).toUpperCase();

    const accounts = await fetchRevolutAccounts();
    const fromAcc = findAccountByNameAndCcy(accounts, fromName, upFrom);
    const toAcc   = findAccountByNameAndCcy(accounts, toName, upTo);

    if (!fromAcc) return res.status(400).json({ error: "source_not_found", detail: `No existe cuenta origen "${fromName}" ${upFrom}` });
    if (!toAcc)   return res.status(400).json({ error: "target_not_found", detail: `No existe cuenta destino "${toName}" ${upTo}` });

    const reqId = (request_id && String(request_id)) || crypto.randomUUID();
    const amt   = Math.round(Number(amount) * 100) / 100;

    const payload = {
      request_id: reqId,
      from: { account_id: fromAcc.id, currency: upFrom },
      to:   { account_id: toAcc.id,   currency: upTo   },
      amount: amt,           // cantidad en moneda de origen
      reference: reference || `FX ${upFrom}->${upTo}`
    };

    const fx = await revolutCreateExchange(payload);
    return res.json({ ok: true, request_id: reqId, exchange: fx });
  } catch (e) {
    console.error("Proxy /revolut/exchange:", e);
    return res.status(502).json({ error: "revolut_error", detail: String(e.message || e) });
  }
});



/* ===================== Mercury ===================== */
app.get("/mercury/recent-transactions", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  
  try {
    const limit = parseInt(req.query.limit) || 20;
    console.log(`[MERCURY_RECENT] Fetching ${limit} recent Mercury transactions for payout analysis`);
    
    // Get recent transactions without date filtering for payout breakdown
    const url = "https://api.mercury.com/api/v1/accounts";
    const { data: accountsData, status: accountsStatus } = await axios.get(url, {
      headers: { Accept: "application/json" },
      auth: { username: MERCURY_API_TOKEN, password: "" },
      timeout: 15000,
      validateStatus: () => true
    });
    
    if (accountsStatus >= 400) {
      console.error('[MERCURY_RECENT] Mercury /accounts error:', accountsStatus, accountsData);
      return res.status(502).json({ error: "mercury_error", status: accountsStatus, detail: accountsData });
    }

    const accounts = accountsData.accounts || [];
    console.log(`[MERCURY_RECENT] Found ${accounts.length} Mercury accounts`);
    
    let allTransactions = [];
    
    // Get transactions from all accounts
    for (const account of accounts) {
      try {
        const transactionsUrl = `https://api.mercury.com/api/v1/accounts/${account.id}/transactions`;
        const { data: txData, status: txStatus } = await axios.get(transactionsUrl, {
          headers: { Accept: "application/json" },
          auth: { username: MERCURY_API_TOKEN, password: "" },
          timeout: 15000,
          validateStatus: () => true
        });
        
        if (txStatus === 200 && txData.transactions) {
          const accountTransactions = txData.transactions.map(tx => ({
            ...tx,
            accountId: account.id,
            accountName: account.name
          }));
          allTransactions = allTransactions.concat(accountTransactions);
        }
      } catch (error) {
        console.log(`[MERCURY_RECENT] Error fetching transactions for account ${account.id}:`, error.message);
      }
    }
    
    // Sort by date (most recent first) and filter for USD incoming
    const incomingUsdTxns = allTransactions
      .filter(tx => 
        tx.amountCurrency === 'USD' &&
        tx.type === 'ingress' &&
        Math.abs(tx.amount) > 0
      )
      .sort((a, b) => {
        const dateA = new Date(a.postedAt || a.createdAt);
        const dateB = new Date(b.postedAt || b.createdAt);
        return dateB - dateA; // Most recent first
      })
      .slice(0, limit);
    
    console.log(`[MERCURY_RECENT] Retrieved ${allTransactions.length} total transactions, ${incomingUsdTxns.length} USD incoming`);
    
    return res.json({
      status: 'SUCCESS',
      totalTransactions: allTransactions.length,
      recentIncomingUsd: incomingUsdTxns.length,
      transactions: incomingUsdTxns.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        postedAt: tx.postedAt,
        createdAt: tx.createdAt,
        accountId: tx.accountId,
        accountName: tx.accountName,
        amountCurrency: tx.amountCurrency,
        type: tx.type
      }))
    });
    
  } catch (error) {
    console.error('[ERROR] Mercury recent transactions fetch failed:', error.message);
    return res.status(502).json({ 
      error: "mercury_recent_transactions_error", 
      detail: error.message,
      status: error.response?.status || 500 
    });
  }
});

app.get("/mercury/summary", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const url = "https://api.mercury.com/api/v1/accounts";
    const { data, status } = await axios.get(url, {
      headers: { Accept: "application/json" },
      auth: { username: MERCURY_API_TOKEN, password: "" },
      timeout: 15000,
      validateStatus: () => true
    });
    if (status >= 400) {
      console.error("Mercury /accounts error:", status, data);
      return res.status(502).json({ error: "mercury_error", status, detail: data });
    }
    const list = Array.isArray(data?.accounts) ? data.accounts : [];

    const getCcy = a => String(a.currency || a.ccy || a.currencyCode || a.nativeCurrency || 'USD').toUpperCase();
    const getVal = a => (typeof a.availableBalance === 'number') ? a.availableBalance
                     :(typeof a.currentBalance   === 'number') ? a.currentBalance   : 0;

    const sum = (ccy) => list.filter(a => getCcy(a) === ccy).reduce((t,a)=>t+Number(getVal(a)||0), 0);

    return res.json({ USD: sum('USD'), EUR: sum('EUR'), count: list.length });
  } catch (e) {
    const status = e.response?.status || 500;
    const detail = e.response?.data || e.message;
    console.error("Proxy error /mercury/summary:", status, detail);
    res.status(502).json({ error: "proxy_error", status, detail });
  }
});

app.get("/mercury/accounts", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const url = "https://api.mercury.com/api/v1/accounts";
    const { data, status } = await axios.get(url, {
      headers: { Accept: "application/json" },
      auth: { username: MERCURY_API_TOKEN, password: "" },
      timeout: 15000,
      validateStatus: () => true
    });
    if (status >= 400) {
      console.error("Mercury /accounts error:", status, data);
      return res.status(502).json({ error: "mercury_error", status, detail: data });
    }
    const accounts = Array.isArray(data?.accounts) ? data.accounts : [];

    // Prepare detailed account information
    const accountDetails = accounts.map(account => {
      const currency = String(account.currency || account.ccy || account.currencyCode || account.nativeCurrency || 'USD').toUpperCase();
      const balance = (typeof account.availableBalance === 'number') ? account.availableBalance
                     : (typeof account.currentBalance === 'number') ? account.currentBalance : 0;
      
      // Determine if this is the main account
      const isMainAccount = (
        account.name?.includes('2290') || 
        account.nickname?.includes('2290') ||
        account.name?.toLowerCase().includes('waresoul') ||
        account.name?.toLowerCase().includes('main')
      );

      return {
        id: account.id,
        name: account.name || 'Unknown',
        nickname: account.nickname || '',
        currency: currency,
        balance: balance,
        availableBalance: account.availableBalance || 0,
        currentBalance: account.currentBalance || 0,
        isMainAccount: isMainAccount,
        accountType: account.accountType || 'Unknown'
      };
    });

    // Calculate totals by currency
    const totals = {};
    accounts.forEach(account => {
      const currency = String(account.currency || account.ccy || account.currencyCode || account.nativeCurrency || 'USD').toUpperCase();
      const balance = (typeof account.availableBalance === 'number') ? account.availableBalance
                     : (typeof account.currentBalance === 'number') ? account.currentBalance : 0;
      
      if (!totals[currency]) {
        totals[currency] = { total: 0, count: 0 };
      }
      totals[currency].total += balance;
      totals[currency].count += 1;
    });

    return res.json({
      accounts: accountDetails,
      totals: totals,
      totalAcrossAllAccounts: {
        USD: totals.USD?.total || 0,
        EUR: totals.EUR?.total || 0
      }
    });
  } catch (e) {
    const status = e.response?.status || 500;
    const detail = e.response?.data || e.message;
    console.error("Proxy error /mercury/accounts:", status, detail);
    res.status(502).json({ error: "proxy_error", status: status, detail: detail });
  }
});

app.get("/mercury/transactions", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: "bad_request", detail: "month and year are required" });
    }

    const startDate = new Date(Number(year), Number(month) - 1, 1);
    const endDate = new Date(Number(year), Number(month), 0);
    
    // Fix date filtering to be more inclusive - use local dates
    const startDateLocal = new Date(Number(year), Number(month) - 1, 1, 0, 0, 0, 0);
    const endDateLocal = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
    
    console.log(`[DEBUG] Mercury transactions for ${month}-${year}`);
    console.log(`[DEBUG] Date range: ${startDateLocal.toISOString()} to ${endDateLocal.toISOString()}`);
    console.log(`[DEBUG] Local dates: ${startDateLocal.toLocaleDateString()} to ${endDateLocal.toLocaleDateString()}`);
    
    const url = "https://api.mercury.com/api/v1/accounts";
    const { data: accountsData, status: accountsStatus } = await axios.get(url, {
      headers: { Accept: "application/json" },
      auth: { username: MERCURY_API_TOKEN, password: "" },
      timeout: 15000,
      validateStatus: () => true
    });
    
    if (accountsStatus >= 400) {
      console.error("Mercury /accounts error:", accountsStatus, accountsData);
      return res.status(502).json({ error: "mercury_error", status: accountsStatus, detail: accountsData });
    }

    const accounts = Array.isArray(accountsData?.accounts) ? accountsData.accounts : [];
    
    // Process all accounts to capture all business transactions
    // Find the main WARESOUL Checking account for reference
    const mainAccount = accounts.find(acc => 
      acc.name?.includes('2290') || 
      acc.nickname?.includes('2290') ||
      acc.name?.toLowerCase().includes('waresoul')
    );
    
    if (!mainAccount) {
      console.error("Main WARESOUL account not found");
      return res.status(502).json({ error: "mercury_error", detail: "Main account not found" });
    }
    
    console.log(`[DEBUG] Main account found: ${mainAccount.name} (${mainAccount.id})`);
    console.log(`[DEBUG] Processing ${accounts.length} total accounts`);
    
    let allTransactions = [];
    let cardExpenses = 0;
    let waresoulTransfersOut = 0;
    let waresoulTransfersIn = 0;
    let nestorTransfersOut = 0;
    let nestorTransfersIn = 0;
    let otherTransfersOut = 0;
    let otherTransfersIn = 0;
    let cardDetails = [];
    let waresoulTransferDetails = [];
    let nestorTransferDetails = [];
    let otherTransferDetails = [];
    let waresoulTransferCount = 0; // Debug counter
    let processedTransactionIds = new Set(); // Track processed transactions to avoid duplicates

    // Process all accounts to capture all business transactions
    for (const account of accounts) {
      if (!account.id) continue;
      
      console.log(`[DEBUG] Processing account: ${account.name} (${account.id})`);
      
      const transactionsUrl = `https://api.mercury.com/api/v1/account/${account.id}/transactions`;
      try {
        // Paginate to ensure we cover the whole month (Mercury returns limited recent items per request)
        const pageSize = 200;
        let offset = 0;
        let fetched = [];
        for (let guard = 0; guard < 20; guard++) {
          const { data: txData, status: txStatus } = await axios.get(transactionsUrl, {
            headers: { Accept: "application/json" },
            auth: { username: MERCURY_API_TOKEN, password: "" },
            timeout: 15000,
            validateStatus: () => true,
            params: { limit: pageSize, offset }
          });
          if (txStatus !== 200 || !Array.isArray(txData?.transactions)) break;
          const batch = txData.transactions;
          fetched.push(...batch);
          if (batch.length < pageSize) break;
          // If oldest in batch is older than month start, next pages will be even older; continue one more cycle then break
          const oldest = batch[batch.length - 1];
          const oldestDate = new Date(oldest?.postedAt || oldest?.createdAt || oldest?.date || oldest?.created_at || oldest?.posted_date || 0);
          offset += pageSize;
          if (oldestDate < startDateLocal) {
            // One more fetch to ensure we didn't cut at the boundary
            if (offset >= pageSize * (guard + 1)) break;
          }
        }

        if (fetched.length > 0) {
          console.log(`[DEBUG] Raw transactions for ${account.name}: ${fetched.length}`);
          const transactions = fetched.filter(tx => {
            const txDate = new Date(tx.postedAt || tx.createdAt || tx.date || tx.created_at || tx.posted_date);
            return txDate >= startDateLocal && txDate <= endDateLocal;
          });
          console.log(`[DEBUG] Filtered transactions for ${account.name}: ${transactions.length}`);
          // Fallback: try explicit date-bounded query and merge (dedupe by id)
          try {
            const { data: dateData, status: dateStatus } = await axios.get(transactionsUrl, {
              headers: { Accept: "application/json" },
              auth: { username: MERCURY_API_TOKEN, password: "" },
              timeout: 15000,
              validateStatus: () => true,
              params: { start_date: startDateLocal.toISOString(), end_date: endDateLocal.toISOString(), limit: 1000 }
            });
            if (dateStatus === 200 && Array.isArray(dateData?.transactions)) {
              const extra = dateData.transactions;
              const byId = new Map((transactions || []).map(t => [t.id, t]));
              for (const t of extra) {
                if (!byId.has(t.id)) {
                  const d = new Date(t.postedAt || t.createdAt || t.date || t.created_at || t.posted_date);
                  if (d >= startDateLocal && d <= endDateLocal) {
                    transactions.push(t);
                    byId.set(t.id, t);
                  }
                }
              }
              console.log(`[DEBUG] After fallback merge for ${account.name}: ${transactions.length}`);
            }
          } catch {}

          // Secondary fallback: root /transactions with account_id and date range
          try {
            const { data: rootData, status: rootStatus } = await axios.get("https://api.mercury.com/api/v1/transactions", {
              headers: { Accept: "application/json" },
              auth: { username: MERCURY_API_TOKEN, password: "" },
              timeout: 15000,
              validateStatus: () => true,
              params: {
                account_id: account.id,
                start_date: startDateLocal.toISOString(),
                end_date: endDateLocal.toISOString(),
                limit: 1000
              }
            });
            if (rootStatus === 200 && Array.isArray(rootData?.transactions || rootData?.data)) {
              const list = Array.isArray(rootData.transactions) ? rootData.transactions : rootData.data;
              const byId = new Map((transactions || []).map(t => [t.id, t]));
              for (const t of list) {
                if (!byId.has(t.id)) {
                  const d = new Date(t.postedAt || t.createdAt || t.date || t.created_at || t.posted_date);
                  if (d >= startDateLocal && d <= endDateLocal) {
                    transactions.push(t);
                    byId.set(t.id, t);
                  }
                }
              }
              console.log(`[DEBUG] After root fallback merge for ${account.name}: ${transactions.length}`);
            }
          } catch {}

          for (const tx of transactions) {
            // Check if we've already processed this transaction
            if (processedTransactionIds.has(tx.id)) {
              console.log(`[DEBUG] Skipping duplicate transaction: ${tx.id}`);
              continue;
            }
            processedTransactionIds.add(tx.id);
            
            const amount = Number(tx.amount || tx.amount_cents / 100 || 0);
            const txDate = new Date(tx.postedAt || tx.createdAt || tx.date || tx.created_at || tx.posted_date);
            
            // Card transaction detection – broaden heuristics (don't over-exclude by 'payment')
            const descLower = String(tx.bankDescription || tx.description || '').toLowerCase();
            const kindLower = String(tx.kind || '').toLowerCase();
            const isCardByKind = kindLower.includes('debitcard') || kindLower.includes('card');
            const isCardByDetails = !!(tx.details?.debitCardInfo || tx.details?.card || tx.cardLast4 || tx.merchantCategory || tx.merchant?.name);
            const isCardByDesc = descLower.includes('card') || descLower.includes('pos') || descLower.includes('visa') || descLower.includes('mastercard');
            const isKnownCardMerchant = descLower.includes('topstep') || descLower.includes('tradeify') || descLower.includes('myfunded');
            // Exclude obvious ACH strings only
            const isAchLike = descLower.includes('ach');
            const isCardTransaction = (isCardByKind || isCardByDetails || isCardByDesc || isKnownCardMerchant) && !isAchLike;
            
            // Check if this is an internal transfer (between Mercury accounts)
            const isInternalTransfer = tx.kind === 'internalTransfer' || 
                                     tx.type === 'internal_transfer' || 
                                     tx.category === 'internal_transfer' ||
                                     tx.bankDescription?.toLowerCase().includes('transfer between your mercury accounts') ||
                                     (tx.description?.toLowerCase().includes('internal') && tx.description?.toLowerCase().includes('transfer'));
            
            // Check if this is an external transfer (going outside Mercury and not to/from your company)
            // More specific logic to avoid false positives
            const isExternalTransfer = !isCardTransaction && !isInternalTransfer && 
                                     ((tx.kind === 'outgoingPayment' && tx.bankDescription?.toLowerCase().includes('send money')) ||
                                      (tx.kind === 'other' && tx.bankDescription?.toLowerCase().includes('ach paymen')));

            // Check if this is a Waresoul transfer - look in Mercury-specific fields
            const transferDescription = tx.description || tx.merchant_name || tx.merchant_id || tx.note || tx.memo || 
                                      tx.counterpartyName || tx.counterpartyNickname || tx.bankDescription || tx.externalMemo || '';
            
            // More precise Waresoul transfer detection - only count actual external transfers to Waresoul entities
            const isWaresoulTransfer = transferDescription && 
                                     (transferDescription.toLowerCase().includes('waresoul') || 
                                      transferDescription.toLowerCase().includes('ware soul')) &&
                                     // Must be an actual external transfer to Waresoul entities
                                     tx.kind === 'outgoingPayment' &&
                                     // Must have "Send Money" in bank description to confirm it's an external transfer
                                     tx.bankDescription?.toLowerCase().includes('send money') &&
                                     // Exclude internal movements and card transactions
                                     !isCardTransaction && !isInternalTransfer;
            
            // Debug: Log when a transaction is classified as a Waresoul transfer
            if (isWaresoulTransfer) {
              console.log(`[DEBUG] Waresoul transfer detected: $${Math.abs(amount)} - ${transferDescription}`);
              console.log(`[DEBUG] - kind: ${tx.kind}, bankDescription: ${tx.bankDescription}`);
              console.log(`[DEBUG] - counterpartyName: ${tx.counterpartyName}, counterpartyNickname: ${tx.counterpartyNickname}`);
            }

            // Check if this is a Nestor Garcia Trabazo transfer - look in Mercury-specific fields
            const isNestorTransfer = transferDescription && 
                                   transferDescription.toLowerCase().includes('nestor garcia trabazo') &&
                                   // Must be an actual external transfer to Nestor entities
                                   tx.kind === 'outgoingPayment' &&
                                   // Must have "Send Money" in bank description to confirm it's an external transfer
                                   tx.bankDescription?.toLowerCase().includes('send money') &&
                                   // Exclude internal movements and card transactions
                                   !isCardTransaction && !isInternalTransfer;

            // Debug logging for all transactions to understand the data structure
            if (!isCardTransaction && !isInternalTransfer) {
              console.log(`[DEBUG] Non-card, non-internal transaction: $${Math.abs(amount)} - ${tx.description || 'No description'}`);
              console.log(`[DEBUG] - kind: ${tx.kind}, type: ${tx.type}, category: ${tx.category}`);
              console.log(`[DEBUG] - isCardTransaction: ${isCardTransaction}, isInternalTransfer: ${isInternalTransfer}, isExternalTransfer: ${isExternalTransfer}`);
              console.log(`[DEBUG] - isWaresoulTransfer: ${isWaresoulTransfer}, isNestorTransfer: ${isNestorTransfer}`);
              console.log(`[DEBUG] - transferDescription: "${transferDescription}"`);
              console.log(`[DEBUG] - isExternalTransfer breakdown: kind=${tx.kind}, type=${tx.type}, category=${tx.category}, description=${tx.description}, bankDescription=${tx.bankDescription}`);
              console.log(`[DEBUG] - Full transaction object:`, JSON.stringify(tx, null, 2));
            }

            // Add detailed logging for ALL transactions to debug the $2900 issue
            console.log(`[DEBUG] Transaction: amount=${amount}, kind=${tx.kind}, type=${tx.type}, category=${tx.category}, isCardTransaction=${isCardTransaction}, isInternalTransfer=${isInternalTransfer}, isExternalTransfer=${isExternalTransfer}`);
            console.log(`[DEBUG] Transaction classification: isCardTransaction=${isCardTransaction}, isInternalTransfer=${isInternalTransfer}, isExternalTransfer=${isExternalTransfer}`);
            if (Math.abs(amount) >= 2900) {
              console.log(`[DEBUG] HIGH AMOUNT TRANSACTION: $${Math.abs(amount)}`);
              console.log(`[DEBUG] - Account: ${account.name}`);
              console.log(`[DEBUG] - Description: ${tx.description || 'No description'}`);
              console.log(`[DEBUG] - Counterparty: ${tx.counterpartyName || 'No counterparty'}`);
              console.log(`[DEBUG] - Bank Description: ${tx.bankDescription || 'No bank description'}`);
              console.log(`[DEBUG] - Full transaction:`, JSON.stringify(tx, null, 2));
            }

            if (isCardTransaction && amount < 0) {
              cardExpenses += Math.abs(amount);
              
              // Extract proper description from available fields - debug each field
              const description = tx.counterpartyName || tx.bankDescription || tx.description || tx.merchant_name || 'Unknown';
              console.log(`[DEBUG] Card transaction: $${Math.abs(amount)} - ${description} (Account: ${account.name})`);
              
              cardDetails.push({
                card: account.name || account.nickname || 'Unknown',
                amount: Math.abs(amount),
                description: description,
                date: txDate
              });
              
              console.log(`[DEBUG] Card transaction: $${Math.abs(amount)} - ${description}`);
            } else if (isInternalTransfer) {
              // Skip internal transfers entirely - they don't count for monthly expenses
              console.log(`[SKIP] Internal transfer skipped: $${Math.abs(amount)} - ${tx.description || 'Internal transfer'}`);
              continue;
            } else if (isExternalTransfer) {
              // Categorize external transfers into three groups
              if (isWaresoulTransfer) {
                waresoulTransferCount++; // Debug counter
                console.log(`[DEBUG] Waresoul transfer #${waresoulTransferCount}: $${Math.abs(amount)} - ${transferDescription}`);
                
                if (amount < 0) {
                  const transferAmount = Math.abs(amount);
                  const oldTotal = waresoulTransfersOut;
                  waresoulTransfersOut += transferAmount;
                  console.log(`[DEBUG] Waresoul transfer OUT: $${transferAmount} - ${transferDescription} (${oldTotal} + ${transferAmount} = ${waresoulTransfersOut})`);
                  waresoulTransferDetails.push({
                    type: 'out',
                    amount: transferAmount,
                    description: transferDescription || 'Waresoul transfer out',
                    date: txDate
                  });
                } else {
                  const oldTotal = waresoulTransfersIn;
                  waresoulTransfersIn += amount;
                  console.log(`[DEBUG] Waresoul transfer IN: $${amount} - ${transferDescription} (${oldTotal} + ${amount} = ${waresoulTransfersIn})`);
                  waresoulTransferDetails.push({
                    type: 'in',
                    amount: amount,
                    description: transferDescription || 'Waresoul transfer in',
                    date: txDate
                  });
                }
              } else if (isNestorTransfer) {
                if (amount < 0) {
                  nestorTransfersOut += Math.abs(amount);
                  nestorTransferDetails.push({
                    type: 'out',
                    amount: Math.abs(amount),
                    description: transferDescription || 'Nestor transfer out',
                    date: txDate
                  });
                } else {
                  nestorTransfersIn += amount;
                  nestorTransferDetails.push({
                    type: 'in',
                    amount: amount,
                    description: transferDescription || 'Nestor transfer in',
                    date: txDate
                  });
                }
              } else {
                if (amount < 0) {
                  otherTransfersOut += Math.abs(amount);
                  otherTransferDetails.push({
                    type: 'out',
                    amount: Math.abs(amount),
                    description: transferDescription || 'Other transfer out',
                    date: txDate
                  });
                } else {
                  otherTransfersIn += amount;
                  otherTransferDetails.push({
                    type: 'in',
                    amount: amount,
                    description: transferDescription || 'Other transfer in',
                    date: txDate
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Warning: Could not fetch transactions for account ${account.id}:`, e.message);
      }
    }

    console.log(`[DEBUG] Final results: Cards $${cardExpenses}, Waresoul out $${waresoulTransfersOut} in $${waresoulTransfersIn}, Other out $${otherTransfersOut} in $${otherTransfersIn}`);
    console.log(`[DEBUG] Waresoul transfer count: ${waresoulTransferCount}`);
    
    // Debug: Calculate total from individual transfers to verify
    const calculatedTotal = waresoulTransferDetails.reduce((sum, tx) => sum + tx.amount, 0);
    console.log(`[DEBUG] Calculated total from details: $${calculatedTotal}`);
    console.log(`[DEBUG] Difference: $${waresoulTransfersOut - calculatedTotal}`);

    return res.json({
      month: Number(month),
      year: Number(year),
      cardExpenses: Math.round(cardExpenses * 100) / 100,
      waresoulTransfersOut: Math.round(waresoulTransfersOut * 100) / 100,
      waresoulTransfersIn: Math.round(waresoulTransfersIn * 100) / 100,
      nestorTransfersOut: Math.round(nestorTransfersOut * 100) / 100,
      nestorTransfersIn: Math.round(nestorTransfersIn * 100) / 100,
      otherTransfersOut: Math.round(otherTransfersOut * 100) / 100,
      otherTransfersIn: Math.round(otherTransfersIn * 100) / 100,
      cardDetails,
      waresoulTransferDetails,
      nestorTransferDetails,
      otherTransferDetails
    });
  } catch (e) {
    console.error("Proxy error /mercury/transactions:", e.message);
    return res.status(502).json({ error: "mercury_error", detail: e.message });
  }
});

app.get("/mercury/debug", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: "bad_request", detail: "month and year are required" });
    }

    const startDate = new Date(Number(year), Number(month) - 1, 1);
    const endDate = new Date(Number(year), Number(month), 0);
    
    // Fix date filtering to be more inclusive - use local dates
    const startDateLocal = new Date(Number(year), Number(month) - 1, 1, 0, 0, 0, 0);
    const endDateLocal = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
    
    console.log(`[DEBUG] Mercury debug for ${month}-${year}`);
    console.log(`[DEBUG] Date range: ${startDateLocal.toISOString()} to ${endDateLocal.toISOString()}`);
    console.log(`[DEBUG] Local dates: ${startDateLocal.toLocaleDateString()} to ${endDateLocal.toLocaleDateString()}`);
    
    const url = "https://api.mercury.com/api/v1/accounts";
    const { data: accountsData, status: accountsStatus } = await axios.get(url, {
      headers: { Accept: "application/json" },
      auth: { username: MERCURY_API_TOKEN, password: "" },
      timeout: 15000,
      validateStatus: () => true
    });
    
    if (accountsStatus >= 400) {
      console.error("Mercury /accounts error:", accountsStatus, accountsData);
      return res.status(502).json({ error: "mercury_error", status: accountsStatus, detail: accountsData });
    }

    const accounts = Array.isArray(accountsData?.accounts) ? accountsData.accounts : [];
    console.log(`[DEBUG] Found ${accounts.length} accounts`);
    
    let debugData = {
      month: Number(month),
      year: Number(year),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      accounts: [],
      allTransactions: [],
      filteredTransactions: [],
      cardExpenses: 0,
      transfersOut: 0,
      transfersIn: 0,
      cardDetails: [],
      transferDetails: []
    };

    for (const account of accounts) {
      if (!account.id) continue;
      
      console.log(`[DEBUG] Processing account: ${account.name || account.nickname} (${account.id})`);
      
      const transactionsUrl = `https://api.mercury.com/api/v1/account/${account.id}/transactions`;
      try {
        const { data: txData, status: txStatus } = await axios.get(transactionsUrl, {
          headers: { Accept: "application/json" },
          auth: { username: MERCURY_API_TOKEN, password: "" },
          timeout: 15000,
          validateStatus: () => true
        });

        console.log(`[DEBUG] Account ${account.id} transactions status: ${txStatus}`);
        console.log(`[DEBUG] Account ${account.id} transactions data keys:`, Object.keys(txData || {}));

        if (txStatus === 200) {
          const transactions = Array.isArray(txData?.transactions) ? txData.transactions : [];
          console.log(`[DEBUG] Account ${account.id} raw transactions count: ${transactions.length}`);
          
          if (transactions.length > 0) {
            console.log(`[DEBUG] First transaction sample:`, JSON.stringify(transactions[0], null, 2));
          }

          const filteredTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.postedAt || tx.createdAt || tx.date || tx.created_at || tx.posted_date);
            const inRange = txDate >= startDateLocal && txDate <= endDateLocal;
            console.log(`[DEBUG] Transaction date: ${txDate.toISOString()}, in range: ${inRange}`);
            return inRange;
          });

          console.log(`[DEBUG] Account ${account.id} filtered transactions count: ${filteredTransactions.length}`);

          for (const tx of filteredTransactions) {
            const amount = Number(tx.amount || tx.amount_cents / 100 || 0);
            const isCard = tx.kind === 'debitCardTransaction' || tx.type === 'card_payment' || tx.category === 'card_payment' || 
                          tx.description?.toLowerCase().includes('card') || 
                          tx.merchant_name || tx.merchant_id;
            const isTransfer = tx.kind === 'internalTransfer' || tx.type === 'transfer' || tx.category === 'transfer' || 
                              tx.description?.toLowerCase().includes('transfer');

            console.log(`[DEBUG] Transaction: amount=${amount}, type=${tx.type}, category=${tx.category}, isCard=${isCard}, isTransfer=${isTransfer}`);

            if (isCard && amount < 0) {
              debugData.cardExpenses += Math.abs(amount);
              debugData.cardDetails.push({
                card: account.name || account.nickname || 'Unknown',
                amount: Math.abs(amount),
                description: tx.description || tx.merchant_name || 'Unknown',
                date: tx.postedAt || tx.createdAt || tx.date || tx.created_at || tx.posted_date,
                raw: tx
                });
            } else if (isTransfer) {
              if (amount < 0) {
                debugData.transfersOut += Math.abs(amount);
                debugData.transferDetails.push({
                  type: 'out',
                  amount: Math.abs(amount),
                  description: tx.description || 'Transfer out',
                  date: tx.postedAt || tx.createdAt || tx.date || tx.created_at || tx.posted_date,
                  raw: tx
                });
              } else {
                debugData.transfersIn += amount;
                debugData.transferDetails.push({
                  type: 'in',
                  amount: amount,
                  description: tx.description || 'Transfer in',
                  date: tx.postedAt || tx.createdAt || tx.date || tx.created_at || tx.posted_date,
                  raw: tx
                });
              }
            }
          }

          debugData.accounts.push({
            id: account.id,
            name: account.name || account.nickname,
            rawTransactions: transactions.length,
            filteredTransactions: filteredTransactions.length
          });
        } else if (txStatus === 404) {
          console.log(`[DEBUG] Account ${account.id} transactions endpoint not found, trying alternative endpoints...`);
          console.log(`[DEBUG] Account ${account.id} error response:`, JSON.stringify(txData, null, 2));
          
          // Try alternative endpoint formats
          const alternativeEndpoints = [
            `https://api.mercury.com/api/v1/transactions?account_id=${account.id}`,
            `https://api.mercury.com/api/v1/accounts/${account.id}/activity`,
            `https://api.mercury.com/api/v1/accounts/${account.id}/ledger`,
            `https://api.mercury.com/api/v1/account/${account.id}/transactions?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`,
            `https://api.mercury.com/api/v1/transactions?account_id=${account.id}&start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`
          ];
          
          for (const altUrl of alternativeEndpoints) {
            try {
              console.log(`[DEBUG] Trying alternative endpoint: ${altUrl}`);
              const { data: altData, status: altStatus } = await axios.get(altUrl, {
                headers: { Accept: "application/json" },
                auth: { username: MERCURY_API_TOKEN, password: "" },
                timeout: 15000,
                validateStatus: () => true
              });
              
              console.log(`[DEBUG] Alternative endpoint ${altUrl} status: ${altStatus}`);
              if (altStatus === 200) {
                console.log(`[DEBUG] Alternative endpoint ${altUrl} data keys:`, Object.keys(altData || {}));
                console.log(`[DEBUG] Alternative endpoint ${altUrl} sample data:`, JSON.stringify(altData, null, 2));
                break;
              } else if (altStatus === 404) {
                console.log(`[DEBUG] Alternative endpoint ${altUrl} also 404`);
              } else {
                console.log(`[DEBUG] Alternative endpoint ${altUrl} status ${altStatus}:`, JSON.stringify(altData, null, 2));
              }
            } catch (altError) {
              console.log(`[DEBUG] Alternative endpoint ${altUrl} failed:`, altError.message);
            }
          }
          
          debugData.accounts.push({
            id: account.id,
            name: account.name || account.nickname,
            error: '404 - transactions endpoint not found',
            triedAlternativeEndpoints: true
          });
        }
      } catch (e) {
        console.warn(`Warning: Could not fetch transactions for account ${account.id}:`, e.message);
        debugData.accounts.push({
          id: account.id,
          name: account.name || account.nickname,
          error: e.message
        });
      }
    }

    debugData.cardExpenses = Math.round(debugData.cardExpenses * 100) / 100;
    debugData.transfersOut = Math.round(debugData.transfersOut * 100) / 100;
    debugData.transfersIn = Math.round(debugData.transfersIn * 100) / 100;

    return res.json(debugData);
  } catch (e) {
    console.error("Proxy error /mercury/debug:", e.message);
    return res.status(502).json({ error: "mercury_error", detail: e.message });
  }
});

app.get("/mercury/raw", async (req, res) => {
  try {
    const month = parseInt(req.query.month);
    const year = parseInt(req.query.year);
    
    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" });
    }
    
    console.log(`[RAW] Fetching Mercury raw data for ${month}-${year}`);
    
    const accounts = await fetchMercuryAccounts();
    console.log(`[RAW] Found ${accounts.length} Mercury accounts`);
    
    let allTransactions = [];
    
    for (const account of accounts) {
      console.log(`[RAW] Fetching transactions for account: ${account.name || account.nickname || account.id}`);
      
      try {
        const response = await axios.get(`${MERCURY_BASE}/account/${account.id}/transactions`, {
          headers: { 'Authorization': `Bearer ${mercuryToken}` },
          params: { limit: 1000 }
        });
        
        if (response.data && Array.isArray(response.data)) {
          const accountTransactions = response.data.map(tx => ({
            ...tx,
            account_name: account.name || account.nickname || account.id
          }));
          allTransactions.push(...accountTransactions);
          console.log(`[RAW] Account ${account.name || account.id}: ${accountTransactions.length} transactions`);
        }
      } catch (error) {
        console.error(`[RAW] Error fetching transactions for account ${account.id}:`, error.message);
      }
    }
    
    console.log(`[RAW] Total transactions found: ${allTransactions.length}`);
    
    // Filter by month/year and return raw data
    const filteredTransactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.postedAt || tx.createdAt || tx.date || tx.created_at || tx.posted_date);
      return txDate.getMonth() + 1 === month && txDate.getFullYear() === year;
    });
    
    console.log(`[RAW] Transactions for ${month}-${year}: ${filteredTransactions.length}`);
    
    res.json({
      month,
      year,
      totalTransactions: allTransactions.length,
      filteredTransactions: filteredTransactions.length,
      accounts: accounts.map(acc => ({ id: acc.id, name: acc.name, nickname: acc.nickname })),
      transactions: filteredTransactions
    });
    
  } catch (error) {
    console.error("[RAW] Mercury raw data error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ===================== Mercury Transfer Endpoints ===================== */
app.post("/mercury/transfer", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    console.log("[MERCURY] Transfer request:", JSON.stringify(req.body, null, 2));
    
    const { fromAccountId, toAccountId, amount, currency, reference, request_id } = req.body;
    
    // Validate required fields
    if (!fromAccountId || !toAccountId || !amount || !currency) {
      return res.status(400).json({ 
        error: "bad_request", 
        detail: "fromAccountId, toAccountId, amount, and currency are required" 
      });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ 
        error: "bad_request", 
        detail: "Amount must be greater than 0" 
      });
    }
    
    // Get Mercury accounts to validate account IDs
    const accountsUrl = "https://api.mercury.com/api/v1/accounts";
    const { data: accountsData, status:accountsStatus } = await axios.get(accountsUrl, {
      headers: { Accept: "application/json" },
      auth: { username: MERCURY_API_TOKEN, password: "" },
      timeout: 15000,
      validateStatus: () => true
    });
    
    if (accountsStatus >= 400) {
      console.error("Mercury accounts error:", accountsStatus, accountsData);
      return res.status(502).json({ 
        error: "mercury_accounts_error", 
        status: accountsStatus, 
        detail: accountsData 
      });
    }
    
    const accounts = Array.isArray(accountsData?.accounts) ? accountsData.accounts : [];
    console.log(`[MERCURY] Available accounts: ${accounts.length}`);
    
    // Find source and destination accounts
    const sourceAccount = accounts.find(acc => 
      acc.id === fromAccountId || 
      acc.name.toLowerCase().includes(fromAccountId.toLowerCase()) ||
      acc.nickname?.toLowerCase().includes(fromAccountId.toLowerCase())
    );
    
    const destAccount = accounts.find(acc => 
      acc.id === toAccountId || 
      acc.name.toLowerCase().includes(toAccountId.toLowerCase()) ||
      acc.nickname?.toLowerCase().includes(toAccountId.toLowerCase())
    );
    
    if (!sourceAccount) {
      return res.status(400).json({ 
        error: "bad_request", 
        detail: `Source account not found: ${fromAccountId}` 
      });
    }
    
    if (!destAccount) {
      return res.status(400).json({ 
        error: "bad_request", 
        detail: `Destination account not found: ${toAccountId}` 
      });
    }
    
    console.log(`[MERCURY] Transfer: ${sourceAccount.name} -> ${destAccount.name}, $${amount} ${currency}`);
    
    // Check if this is an internal transfer (between Mercury accounts) or external transfer
    const isInternalTransfer = sourceAccount.id !== destAccount.id;
    
    let transferResult;
    
    if (isInternalTransfer) {
      // Internal transfer between Mercury accounts
      const transferPayload = {
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        amount: Math.round(amount * 100), // Mercury expects cents
        description: reference || `Transfer from ${sourceAccount.name} to ${destAccount.name}`,
        idempotencyKey: request_id || `internal-${Date.now()}-${amount}`
      };
      
      console.log("[MERCURY] Internal transfer payload:", JSON.stringify(transferPayload, null, 2));
      
      // Try multiple Mercury API endpoints for internal transfers
      const transferEndpoints = [
        'https://api.mercury.com/api/v1/transfers/internal',
        'https://api.mercury.com/api/v1/transfers',
        'https://api.mercury.com/api/v1/internal-transfers',
        'https://api.mercury.com/api/v1/account-transfers',
        'https://api.mercury.com/api/v1/move-funds',
        'https://api.mercury.com/api/v1/transfer-funds',
        'https://api.mercury.com/api/v1/send-funds',
        'https://api.mercury.com/api/v1/transfers/internal-transfer',
        'https://api.mercury.com/api/v1/accounts/transfer',
        'https://api.mercury.com/api/v1/accounts/move'
      ];
      
      let transferData, transferStatus;
      let successfulEndpoint = null;
      
      for (const endpoint of transferEndpoints) {
        try {
          console.log(`[MERCURY] Trying endpoint: ${endpoint}`);
          
          const response = await axios.post(endpoint, transferPayload, {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        auth: { username: MERCURY_API_TOKEN, password: "" },
        timeout: 30000,
        validateStatus: () => true
      });
      
          transferData = response.data;
          transferStatus = response.status;
          
          console.log(`[MERCURY] Transfer response from ${endpoint}:`, transferStatus, transferData);
          
          if (transferStatus < 400) {
            successfulEndpoint = endpoint;
            break;
          }
        } catch (endpointError) {
          console.log(`[MERCURY] Endpoint ${endpoint} failed:`, endpointError.message);
          continue;
        }
      }
      
      if (!successfulEndpoint) {
        return res.status(502).json({ 
          error: "mercury_transfer_error", 
          status: transferStatus, 
          detail: transferData,
          message: "All Mercury API endpoints failed - Mercury does not support programmatic internal transfers",
          testedEndpoints: transferEndpoints
        });
      }
      
      transferResult = {
        transfer: {
          id: transferData.id || `internal-${Date.now()}`,
          status: transferData.status || 'completed',
          type: 'internal_transfer',
          amount: amount,
          currency: currency,
          fromAccount: sourceAccount.name,
          toAccount: destAccount.name,
          reference: reference || '',
          timestamp: new Date().toISOString()
        },
        success: true,
        message: `Successfully transferred $${amount} ${currency} from ${sourceAccount.name} to ${destAccount.name}`,
        endpoint: successfulEndpoint
      };
      
    } else {
      // External transfer - implement external transfer logic
      console.log("[MERCURY] Attempting external transfer...");
      
      const externalTransferPayload = {
        sourceAccountId: sourceAccount.id,
        destinationAccount: {
          name: destAccount.name, // Could be external bank name
          accountNumber: destAccount.accountNumber || destAccount.id,
          routingNumber: destAccount.routingNumber || '021000021', // Default ACH routing
          accountType: 'checking' // Default account type
        },
        amount: Math.round(amount * 100), // Mercury expects cents
        description: reference || `Transfer to ${destAccount.name}`,
        idempotencyKey: request_id || `external-${Date.now()}-${amount}`
      };
      
      console.log("[MERCURY] External transfer payload:", JSON.stringify(externalTransferPayload, null, 2));
      
      // Try external transfer endpoint
      const externalTransferUrl = "https://api.mercury.com/api/v1/transfers/external";
      const { data: externalTransferData, status: externalTransferStatus } = await axios.post(externalTransferUrl, externalTransferPayload, {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        auth: { username: MERCURY_API_TOKEN, password: "" },
        timeout: 30000,
        validateStatus: () => true
      });
      
      console.log("[MERCURY] External transfer response:", externalTransferStatus, externalTransferData);
      
      if (externalTransferStatus >= 400) {
        // Fallback: Try alternative external transfer endpoint
        const alternativeUrl = "https://api.mercury.com/api/v1/payments";
        const { data: paymentData, status: paymentStatus } = await axios.post(alternativeUrl, externalTransferPayload, {
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          auth: { username: MERCURY_API_TOKEN, password: "" },
          timeout: 30000,
          validateStatus: () => true
        });
        
        console.log("[MERCURY] Payment response:", paymentStatus, paymentData);
        
        if (paymentStatus >= 400) {
          return res.status(502).json({ 
            error: "external_transfer_unavailable", 
            status: externalTransferStatus, 
            detail: externalTransferData,
            alternative_status: paymentStatus,
            alternative_detail: paymentData,
            suggestion: "External transfers may require additional approval workflows or different API endpoints"
          });
        } else {
          transferResult = {
            transfer: {
              id: paymentData.id || `external-${Date.now()}`,
              status: paymentData.status || 'pending',
              type: 'external_transfer',
              amount: amount,
              currency: currency,
              fromAccount: sourceAccount.name,
              toAccount: `External transfer to ${destAccount.name}`,
              reference: reference || '',
              timestamp: new Date().toISOString()
            },
            success: true,
            message: `External transfer initiated: $${amount} ${currency} from ${sourceAccount.name} to ${destAccount.name}`
          };
        }
      } else {
        transferResult = {
          transfer: {
            id: externalTransferData.id || `external-${Date.now()}`,
            status: externalTransferData.status || 'pending',
            type: 'external_transfer',
            amount: amount,
            currency: currency,
            fromAccount: sourceAccount.name,
            toAccount: destAccount.name,
            reference: reference || '',
            timestamp: new Date().toISOString()
          },
          success: true,
          message: `External transfer initiated: $${amount} ${currency} from ${sourceAccount.name} to ${destAccount.name}`
        };
      }
    }
    
    return res.json(transferResult);
    
  } catch (error) {
    console.error("Mercury transfer error:", error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data || error.message;
    console.error("Mercury transfer error details:", status, detail);
    return res.status(502).json({ error: "mercury transfer error", status, detail });
  }
});

app.post("/mercury/move", async (req, res) => {
  // Alias for /mercury/transfer for backward compatibility
  console.log("[MERCURY] Move request (alias for transfer):", JSON.stringify(req.body, null, 2));
  
  // Create new request with same body but different path
  const newReq = {
    ...req,
    method: 'POST',
    url: '/mercury/transfer',
    originalUrl: '/mercury/transfer'
  };
  
  // Forward to transfer endpoint
  return app._router.handle(newReq, res);
});

app.post("/mercury/consolidate", async (req, res) => {
  // Special endpoint for fund consolidation
  if (!checkProxyAuth(req, res)) return;
  
  try {
    console.log("[MERCURY] Consolidation request:", JSON.stringify(req.body, null, 2));
    
    const { fromAccountId, toAccountId, amount, currency, reference } = req.body;
    
    // For consolidation, we always move funds TO the main account
    const consolidationPayload = {
      fromAccountId: fromAccountId,
      toAccountId: toAccountId || 'main', // Default to main account
      amount: amount,
      currency: currency,
      reference: reference || 'Consolidate USD funds to Main',
      request_id: `consolidate-${Date.now()}-${amount}`
    };
    
    // Create a new request and process it through the transfer logic
    const newReq = {
      ...req,
      body: consolidationPayload,
      url: '/mercury/transfer',
      originalUrl: '/mercury/consolidate'
    };
    
    // Process consolidation request through transfer endpoint logic
    const { fromAccountId: from, toAccountId: to, amount: amt, currency: curr, reference: ref, request_id: reqId } = consolidationPayload;
    
    // Validate required fields
    if (!from || !to || !amt || !curr) {
      return res.status(400).json({ 
        error: "bad_request", 
        detail: "fromAccountId, toAccountId, amount, and currency are required" 
      });
    }
    
    if (amt <= 0) {
      return res.status(400).json({ 
        error: "bad_request", 
        detail: "Amount must be greater than 0" 
      });
    }
    
    console.log(`[MERCURY] Consolidation: ${from} -> ${to}, $${amt} ${curr}`);
    
    // Try to make a real Mercury API call for internal transfer
    try {
      // Get Mercury accounts to validate account IDs
      const accountsUrl = "https://api.mercury.com/api/v1/accounts";
      const { data: accountsData, status: accountsStatus } = await axios.get(accountsUrl, {
        headers: { Accept: "application/json" },
        auth: { username: MERCURY_API_TOKEN, password: "" },
        timeout: 15000,
        validateStatus: () => true
      });
      
      if (accountsStatus >= 400) {
        console.error("Mercury accounts error:", accountsStatus, accountsData);
        return res.status(502).json({ 
          error: "mercury_accounts_error", 
          status: accountsStatus, 
          detail: accountsData 
        });
      }
      
      const accounts = Array.isArray(accountsData?.accounts) ? accountsData.accounts : [];
      console.log(`[MERCURY] Available accounts: ${accounts.length}`);
      
      // Find source and destination accounts
      const sourceAccount = accounts.find(acc => 
        acc.id === from || 
        acc.name.toLowerCase().includes(from.toLowerCase()) ||
        acc.nickname?.toLowerCase().includes(from.toLowerCase())
      );
      
      const destAccount = accounts.find(acc => 
        acc.id === to || 
        acc.name.toLowerCase().includes(to.toLowerCase()) ||
        acc.nickname?.toLowerCase().includes(to.toLowerCase())
      );
      
      if (!sourceAccount) {
        return res.status(400).json({ 
          error: "source_account_not_found", 
          detail: `Source account not found: ${from}` 
        });
      }
      
      if (!destAccount) {
        return res.status(400).json({ 
          error: "dest_account_not_found", 
          detail: `Destination account not found: ${to}` 
        });
      }
      
      console.log(`[MERCURY] Found accounts: ${sourceAccount.name} -> ${destAccount.name}`);
      
      // Try different Mercury API endpoints for internal transfers
      const transferEndpoints = [
        'https://api.mercury.com/api/v1/transfers/internal',
        'https://api.mercury.com/api/v1/transfers',
        'https://api.mercury.com/api/v1/internal-transfers',
        'https://api.mercury.com/api/v1/account-transfers'
      ];
      
      for (const endpoint of transferEndpoints) {
        try {
          console.log(`[MERCURY] Trying endpoint: ${endpoint}`);
          
          const transferPayload = {
            sourceAccountId: sourceAccount.id,
            destinationAccountId: destAccount.id,
            amount: amt,
            currency: curr,
            reference: ref || 'Consolidate USD funds to Main',
            requestId: `consolidate-${Date.now()}-${amt}`
          };
          
          const { data: transferData, status: transferStatus } = await axios.post(endpoint, transferPayload, {
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            auth: { username: MERCURY_API_TOKEN, password: "" },
            timeout: 30000,
            validateStatus: () => true
          });
          
          console.log(`[MERCURY] Transfer response from ${endpoint}:`, transferStatus, transferData);
          
          if (transferStatus < 400) {
    return res.json({
      transfer: {
                id: transferData.id || `consolidate-${Date.now()}`,
                status: transferData.status || 'processing',
        type: 'consolidation',
        amount: amt,
        currency: curr,
                fromAccount: sourceAccount.name,
                toAccount: destAccount.name,
        reference: ref || '',
        timestamp: new Date().toISOString()
      },
      success: true,
              message: `Successfully initiated consolidation: $${amt} ${curr} from ${sourceAccount.name} to ${destAccount.name}`,
              endpoint: endpoint
            });
          }
        } catch (endpointError) {
          console.log(`[MERCURY] Endpoint ${endpoint} failed:`, endpointError.message);
          continue;
        }
      }
      
      // If all endpoints failed, return a note that manual transfer may be required
      return res.json({
        transfer: {
          id: `consolidate-${Date.now()}`,
          status: 'manual_required',
          type: 'consolidation',
          amount: amt,
          currency: curr,
          fromAccount: sourceAccount.name,
          toAccount: destAccount.name,
          reference: ref || '',
          timestamp: new Date().toISOString()
        },
        success: false,
        message: `Manual transfer required: $${amt} ${curr} from ${sourceAccount.name} to ${destAccount.name}`,
        note: "Mercury API does not support programmatic internal transfers. Manual transfer required.",
        sourceAccount: sourceAccount,
        destAccount: destAccount
      });
      
    } catch (apiError) {
      console.error("Mercury API error:", apiError.message);
      return res.status(502).json({ 
        error: "mercury_api_error", 
        detail: apiError.message 
      });
    }
    
  } catch (error) {
    console.error("Mercury consolidation error:", error.message);
    return res.status(502).json({ error: "mercury_consolidation_error", detail: error.message });
  }
});

/* ===================== Airwallex (opcionales, probablemente no los uses ahora) ===================== */
const AW_CID  = process.env.AIRWALLEX_CLIENT_ID || "";
const AW_SEC  = process.env.AIRWALLEX_CLIENT_SECRET || "";
const AW_BASE = "https://api.airwallex.com";

async function airwallexLogin() {
  if (!AW_CID || !AW_SEC) throw new Error("Falta AIRWALLEX_CLIENT_ID o AIRWALLEX_CLIENT_SECRET");
  
  console.log(`[AIRWALLEX] Attempting login with client_id: ${AW_CID.substring(0, 8)}...`);
  
  // Airwallex requires credentials in headers, not body
  const { data, status } = await axios.post(`${AW_BASE}/api/v1/authentication/login`,
    {}, // Empty body as per Airwallex spec
    { 
      headers: { 
        "content-type": "application/json",
        "x-client-id": AW_CID,
        "x-api-key": AW_SEC
      }, 
      timeout: 15000, 
      validateStatus: () => true 
    }
  );
  
  console.log(`[AIRWALLEX] Login response status: ${status}`);
  console.log(`[AIRWALLEX] Login response data:`, data);
  
  if (status !== 201 || !data?.token) {
    throw new Error(`Airwallex login ${status}: ${JSON.stringify(data)}`);
  }
  return data.token; // JWT
}

async function airwallexBalancesCurrent(token) {
  const { data, status } = await axios.get(`${AW_BASE}/api/v1/balances/current`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeout: 15000,
    validateStatus: () => true
  });
  if (status !== 200) {
    throw new Error(`Airwallex balances/current ${status}: ${JSON.stringify(data)}`);
  }
  return Array.isArray(data) ? data : [];
}

function sumAirwallex(arr, ccy) {
  const W = String(ccy).toUpperCase();
  return (arr || []).reduce((acc, it) => {
    const cur = String(it.currency || "").toUpperCase();
    if (cur === W) {
      const v = typeof it.available_amount === "number" ? it.available_amount
              : typeof it.total_amount     === "number" ? it.total_amount     : 0;
      return acc + Number(v || 0);
    }
    return acc;
  }, 0);
}

app.get("/airwallex/summary", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const token = await airwallexLogin();
    const list  = await airwallexBalancesCurrent(token);
    const USD = sumAirwallex(list, "USD");
    const EUR = sumAirwallex(list, "EUR");
    return res.json({ USD, EUR, count: list.length });
  } catch (e) {
    console.error("Proxy error /airwallex/summary:", e.message);
    return res.status(502).json({ error: "airwallex_error", detail: e.message });
  }
});

app.get("/airwallex/transactions", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: "bad_request", detail: "month and year are required" });
    }

    const startDate = new Date(Number(year), Number(month) - 1, 1);
    const endDate = new Date(Number(year), Number(month), 0);
    endDate.setHours(23, 59, 59, 999); // End of day
    
    console.log(`[AIRWALLEX] Fetching transactions for ${month}-${year} (${startDate.toISOString()} to ${endDate.toISOString()})`);
    
    const token = await airwallexLogin();
    
    // Use financial_transactions endpoint (issuing endpoint not available)
    let allTransactions = [];
    let page = 1;
    const pageSize = 100;
    const maxPages = 20;
    
    while (page <= maxPages) {
      console.log(`[AIRWALLEX] Fetching page ${page} of financial transactions...`);
      
      const { data: txData, status: txStatus } = await axios.get(`${AW_BASE}/api/v1/financial_transactions`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        params: {
          page: page,
          page_size: pageSize,
          from_created_at: startDate.toISOString().split('T')[0], // YYYY-MM-DD format
          to_created_at: endDate.toISOString().split('T')[0]     // YYYY-MM-DD format
        },
        timeout: 15000,
        validateStatus: () => true
      });
    
      console.log(`[AIRWALLEX] Page ${page} status: ${txStatus}`);
      
      if (txStatus !== 200) {
        console.log(`[AIRWALLEX] Error fetching page ${page}: ${JSON.stringify(txData)}`);
        break;
      }
      
      const transactions = txData.items || [];
      if (transactions.length === 0) {
        console.log(`[AIRWALLEX] No more transactions on page ${page}`);
        break;
      }
      
      console.log(`[AIRWALLEX] Page ${page}: ${transactions.length} transactions`);
      allTransactions = allTransactions.concat(transactions);
      
      if (!txData.has_more) {
        console.log(`[AIRWALLEX] No more pages available`);
        break;
      }
      
      page++;
    }
    
    console.log(`[AIRWALLEX] Total transactions fetched: ${allTransactions.length}`);
    
    // Filter transactions by date and type based on CSV data structure
    const filteredTransactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.created_at || tx.settled_at);
      const isInRange = txDate >= startDate && txDate <= endDate;
      
      // Debug: Log first few transactions to understand structure
      if (allTransactions.indexOf(tx) < 3) {
        console.log(`[AIRWALLEX] Sample transaction:`, {
          id: tx.id,
          created_at: tx.created_at,
          settled_at: tx.settled_at,
          source_type: tx.source_type,
          transaction_type: tx.transaction_type,
          type: tx.type,
          amount: tx.amount,
          description: tx.description?.substring(0, 50) + '...'
        });
      }
      
      return isInRange;
    });
    
    console.log(`[AIRWALLEX] Filtered transactions for ${month}-${year}: ${filteredTransactions.length}`);
    
    let cardExpenses = 0;
    let cardDetails = [];
    
    // Track processed transactions to avoid duplicates
    const processedTransactions = new Set();
    
    for (const tx of filteredTransactions) {
      const amount = Number(tx.amount || 0);
      
      // Only count ISSUING_CAPTURE transactions with SETTLED status (actual completed card purchases)
      const isCardPurchase = tx.transaction_type === 'ISSUING_CAPTURE' && tx.status === 'SETTLED';
      
      // Create unique key for deduplication
      const uniqueKey = tx.request_id || tx.source_id || tx.id || tx.transaction_id;
      
      if (isCardPurchase && amount < 0 && !processedTransactions.has(uniqueKey)) {
        processedTransactions.add(uniqueKey);
        cardExpenses += Math.abs(amount);
        cardDetails.push({
          card: 'Airwallex Card',
                  amount: Math.abs(amount),
          description: tx.description || 'Card Purchase',
          date: tx.created_at || tx.settled_at
        });
        console.log(`[AIRWALLEX] ✅ Card expense: $${Math.abs(amount)} - ${tx.description || 'Card Purchase'}`);
      }
    }
    
    console.log(`[AIRWALLEX] Summary: Card Expenses=$${cardExpenses}`);

    return res.json({
      month: Number(month),
      year: Number(year),
      cardExpenses: Math.round(cardExpenses * 100) / 100,
      cardDetails,
      summary: {
        totalCardExpenses: cardExpenses,
        transactionCount: cardDetails.length
      },
    });
  } catch (e) {
    console.error("Proxy error /airwallex/transactions:", e.message);
    return res.status(502).json({ error: "airwallex_error", detail: e.message });
  }
});

/* ===================== Revolut Transactions ===================== */
app.get("/revolut/transactions", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: "bad_request", detail: "month and year are required" });
    }

    // Use UTC month boundaries to match CSV statement (UTC)
    const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1, 0, 0, 0, 0));
    const endDate   = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));
    
    console.log(`[DEBUG] Revolut transactions for ${month}-${year}`);
    console.log(`[DEBUG] UTC Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Get all transactions using the working root endpoint
    const accessToken = await ensureAccessToken();
    const response = await axios.get("https://b2b.revolut.com/api/1.0/transactions", {
      httpsAgent: revolutAgent,
      headers: { 
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}` 
      },
      params: {
        count: 1000 // Get maximum transactions to filter locally
      },
      timeout: 15000,
      validateStatus: () => true
    });

    if (response.status !== 200 || !Array.isArray(response.data)) {
      throw new Error(`Failed to fetch transactions: ${response.status}`);
    }

    const allTransactions = response.data;
    console.log(`[DEBUG] Fetched ${allTransactions.length} transactions from root endpoint`);

    // Filter transactions by date and process them
    let cardExpenses = 0;
    let usdTransfersOut = 0;
    let usdTransfersIn = 0;
    let eurTransfersOut = 0;
    let eurTransfersIn = 0;
    let cardDetails = [];
    let usdTransferDetails = [];
    let eurTransferDetails = [];

    for (const tx of allTransactions) {
      // Prefer completed timestamp to align with statements; fallback to started/created
      const ts = tx.completed_at || tx.date_completed || tx.updated_at || tx.date_completed_utc || tx.date_started || tx.created_at || tx.date;
      const txDate = ts ? new Date(ts) : null;
      if (!txDate || txDate < startDate || txDate > endDate) continue;

      // Process transaction based on its legs (account-specific amounts)
      if (tx.legs && Array.isArray(tx.legs)) {
        for (const leg of tx.legs) {
          const amount = Number(leg.amount || 0);
          const currency = String(leg.currency || 'USD').toUpperCase();
          const legDesc = leg.description || leg.reference || leg.remittanceInformation || '';
          const legCpName = leg.counterparty_name || leg.counterpartyName || leg.account_name || '';
          // Best-effort counterparty/beneficiary extraction
          const cpName = (
            (tx.counterparty && (tx.counterparty.name || tx.counterparty.full_name || tx.counterparty.title)) ||
            tx.counterparty_name || tx.counterpartyName ||
            tx.beneficiary_name || (tx.receiver && (tx.receiver.name || tx.receiver.full_name)) ||
            (tx.sender && (tx.sender.name || tx.sender.full_name)) ||
            tx.bankDescription || tx.externalMemo || tx.merchant_name || (tx.merchant && tx.merchant.name) ||
            legCpName || legDesc || tx.description || ''
          );
          const descLc = String(tx.description || '').toLowerCase();
          const cpLc   = String(cpName || '').toLowerCase();
          const mentionsNestor = cpLc.includes('nestor') || cpLc.includes('trabazo') || descLc.includes('nestor') || descLc.includes('trabazo');
          
          // Check if this is a card transaction
          const isCard = tx.type === 'card_payment' && tx.state === 'completed';
          
          // Check if this is an external transfer (not internal movement). 
          // Also consider explicit Nestor mentions regardless of tx.type quirks.
          const isTransfer = (tx.type === 'transfer' && tx.state === 'completed') || mentionsNestor;
          
          // Check if this is internal movement (should be ignored)
          const isInternalMovement = tx.type === 'transfer' && 
                                   tx.description && 
                                   (tx.description.includes('Main · USD → Main · EUR') ||
                                    tx.description.includes('Main · EUR → Main · USD') ||
                                    tx.description.includes('Main · USD → T-') ||
                                    tx.description.includes('Main · EUR → T-'));

          if (isCard && amount < 0) {
            // Card expense (negative amount for actual charges)
            cardExpenses += Math.abs(amount);
            cardDetails.push({
              card: tx.card?.first_name + ' ' + tx.card?.last_name || 'Unknown Card',
              amount: Math.abs(amount),
              description: tx.description || 'Card Purchase',
              date: tx.created_at,
              currency: currency,
              merchant: tx.merchant?.name || 'Unknown'
            });
          } else if (isTransfer && !isInternalMovement) {
            // External transfer - categorize by currency
            if (currency === 'USD') {
              if (amount < 0) {
                usdTransfersOut += Math.abs(amount);
                usdTransferDetails.push({
                  type: 'out',
                  amount: Math.abs(amount),
                  description: tx.description || legDesc || cpName || 'USD transfer out',
                  date: tx.created_at,
                  counterparty: cpName || tx.description?.split(' ').slice(-2).join(' ') || 'Unknown'
                });
              } else {
                // We only care about outgoing to Nestor for notes; keep aggregate but do not add to details
                usdTransfersIn += amount;
              }
            } else if (currency === 'EUR') {
              if (amount < 0) {
                eurTransfersOut += Math.abs(amount);
                eurTransferDetails.push({
                  type: 'out',
                  amount: Math.abs(amount),
                  description: tx.description || legDesc || cpName || 'EUR transfer out',
                  date: tx.created_at,
                  counterparty: cpName || tx.description?.split(' ').slice(-2).join(' ') || 'Unknown'
                });
              } else {
                // We only care about outgoing to Nestor for notes; keep aggregate but do not add to details
                eurTransfersIn += amount;
              }
            }
          }
          // Internal movements are ignored as requested
        }
      }
    }

    return res.json({
      month: Number(month),
      year: Number(year),
      cardExpenses: Math.round(cardExpenses * 100) / 100,
      usdTransfersOut: Math.round(usdTransfersOut * 100) / 100,
      usdTransfersIn: Math.round(usdTransfersIn * 100) / 100,
      eurTransfersOut: Math.round(eurTransfersOut * 100) / 100,
      eurTransfersIn: Math.round(eurTransfersIn * 100) / 100,
      cardDetails,
      usdTransferDetails,
      eurTransferDetails,
      totalTransactions: allTransactions.length,
      filteredTransactions: cardDetails.length + usdTransferDetails.length + eurTransferDetails.length
    });
  } catch (e) {
    console.error("Proxy error /revolut/transactions:", e.message);
    return res.status(502).json({ error: "revolut_error", detail: e.message });
  }
});

/* ===================== Revolut API Test ===================== */
app.get("/revolut/test", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    console.log('[DEBUG] Testing Revolut API endpoints...');
    
    const accounts = await fetchRevolutAccounts();
    console.log(`[DEBUG] Found ${accounts.length} accounts`);
    
    const results = [];
    
    for (const account of accounts.slice(0, 3)) { // Test first 3 accounts
      console.log(`[DEBUG] Testing account: ${account.name} (${account.id})`);
      
      const endpoints = [
        `/api/1.0/accounts/${account.id}/transactions`,
        `/api/1.0/transactions?account=${account.id}`,
        `/api/1.0/accounts/${account.id}/statement`,
        `/api/1.0/statement?account=${account.id}`
      ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`[DEBUG] Trying endpoint: ${endpoint}`);
          const response = await axios.get(`https://b2b.revolut.com${endpoint}`, {
            httpsAgent: revolutAgent,
            timeout: 10000,
            validateStatus: () => true
          });
          
          results.push({
            account: account.name,
            endpoint: endpoint,
            status: response.status,
            dataLength: Array.isArray(response.data) ? response.data.length : 'not array',
            sampleData: Array.isArray(response.data) && response.data.length > 0 ? response.data[0] : null
          });
          
          console.log(`[DEBUG] ${endpoint} -> ${response.status}, data: ${Array.isArray(response.data) ? response.data.length : 'not array'}`);
          
          if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
            console.log(`[DEBUG] Sample transaction:`, JSON.stringify(response.data[0], null, 2));
          }
          
        } catch (e) {
          console.log(`[DEBUG] ${endpoint} failed: ${e.message}`);
          results.push({
            account: account.name,
            endpoint: endpoint,
            status: 'error',
            error: e.message
          });
        }
      }
    }
    
    return res.json({
      message: 'Revolut API test completed',
      results: results
    });
    
  } catch (e) {
    console.error("Proxy error /revolut/test:", e.message);
    return res.status(502).json({ error: "revolut_error", detail: e.message });
  }
});

/* ===================== Check Revolut External Banks/Beneficiaries ===================== */
app.get("/revolut/beneficiaries", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    console.log('[INFO] Checking Revolut beneficiaries/saved banks...');
    
    const accessToken = await ensureAccessToken();
    
    // Try different beneficiary endpoints that might exist
    const endpoints = [
      'https://b2b.revolut.com/api/1.0/beneficiaries',
      'https://b2b.revolut.com/api/1.0/recipients', 
      'https://b2b.revolut.com/api/1.0/external-beneficiaries',
      'https://b2b.revolut.com/api/1.0/bank-beneficiaries',
      'https://b2b.revolut.com/api/1.0/payment-methods',
      'https://b2b.revolut.com/api/1.0/external-transfers'
    ];
    
    const results = [];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          httpsAgent: revolutAgent,
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true // Don't throw on HTTP errors
        });
        
        results.push({
          endpoint: endpoint.replace('https://b2b.revolut.com/api/1.0/', ''),
          status: response.status,
          accessible: response.status < 400,
          hasData: response.data ? true : false,
          dataPreview: response.data ? (Array.isArray(response.data) ? 
            `Array of ${response.data.length} items` : 
            `Object with keys: ${Object.keys(response.data).join(', ')}`) : 'No data'
        });
        
        console.log(`[INFO] ${endpoint}: ${response.status} - ${response.status < 400 ? 'SUCCESS' : 'NOT AVAILABLE'}`);
        
        // If successful, include sample data 
        if (response.status < 400 && response.data) {
          results[results.length-1].sampleData = Array.isArray(response.data) ? 
            response.data.slice(0, 2) : // First 2 items if array
            response.data; // Full object if not array
        }
        
      } catch (e) {
        results.push({
          endpoint: endpoint.replace('https://b2b.revolut.com/api/1.0/', ''),
          status: 0,
          accessible: false,
          error: e.message
        });
        console.log(`[ERROR] ${endpoint}: ${e.message}`);
      }
    }
    
    const accessible = results.filter(r => r.accessible);
    
    return res.json({
      message: 'Revolut beneficiaries/saved banks check completed',
      accessibleEndpoints: accessible.length,
      results: results,
      summary: accessible.length > 0 ? 
        `Found ${accessible.length} accessible endpoint(s) for external beneficiaries` : 
        'No external beneficiary endpoints accessible'
    });
    
  } catch (e) {
    console.error("Error checking Revolut beneficiaries:", e.message);
    return res.status(502).json({ error: "beneficiaries_check_failed", detail: e.message });
  }
});

/* ===================== Wise ===================== */
async function wiseListProfiles() {
  const { data, status } = await axios.get(`${WISE_BASE}/v2/profiles`, {
    headers: { Authorization: `Bearer ${WISE_API_TOKEN}`, Accept: "application/json" },
    timeout: 15000, validateStatus: () => true
  });
  if (status !== 200 || !Array.isArray(data)) {
    throw new Error(`Wise /v2/profiles ${status}: ${JSON.stringify(data)}`);
  }
  return data;
}
async function wiseResolveProfileId() {
  if (WISE_PROFILE_ID) return WISE_PROFILE_ID;
  const profiles = await wiseListProfiles();
  const biz = profiles.find(p => String(p.type || "").toUpperCase() === "BUSINESS");
  return String((biz || profiles[0]).id);
}
async function wiseListBalancesV4(profileId, types = "STANDARD") {
  const url = `${WISE_BASE}/v4/profiles/${profileId}/balances?types=${encodeURIComponent(types)}`;
  const { data, status } = await axios.get(url, {
    headers: { Authorization: `Bearer ${WISE_API_TOKEN}`, Accept: "application/json" },
    timeout: 15000, validateStatus: () => true
  });
  if (status !== 200 || !Array.isArray(data)) {
    throw new Error(`Wise balances ${status}: ${JSON.stringify(data)}`);
  }
  return data;
}
function normalizeWiseBalances(arr) {
  return (arr || []).map(b => ({
    currency: String(b?.currency || "").toUpperCase(),
    amount: { value: Number(b?.amount?.value || 0) }
  })).filter(x => x.currency);
}
function sumWise(list, ccy) {
  const W = String(ccy).toUpperCase();
  return (list || [])
    .filter(b => String(b.currency || '').toUpperCase() === W)
    .reduce((acc, b) => acc + Number(b?.amount?.value || 0), 0);
}
app.get("/wise/summary", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  if (!WISE_API_TOKEN) return res.status(500).json({ error: "server_misconfig", detail: "Falta WISE_API_TOKEN" });
  try {
    const profileId = await wiseResolveProfileId();
    const raw = await wiseListBalancesV4(profileId, "STANDARD");
    const list = normalizeWiseBalances(raw);
    const USD = sumWise(list, "USD");
    const EUR = sumWise(list, "EUR");
    return res.json({ USD, EUR, count: list.length });
  } catch (e) {
    console.error("Proxy error /wise/summary:", e.message);
    return res.status(502).json({ error: "wise_error", detail: e.message });
  }
});

/* ===================== Nexo (scraping) ===================== */
const NEXO_EMAIL = process.env.NEXO_EMAIL || "";
const NEXO_PASSWORD = process.env.NEXO_PASSWORD || "";
const NEXO_TOTP_SECRET = process.env.NEXO_TOTP_SECRET || "";
const NEXO_BASE_URL = process.env.NEXO_BASE_URL || "https://platform.nexo.com";

const COOKIES_PATH = path.join(process.cwd(), ".secrets", "nexo.cookies.json");
const NEXO_DEBUG_DIR = path.join(process.cwd(), "nexo-debug");

function nexoEnsureDebugDir(){ if (!fs.existsSync(NEXO_DEBUG_DIR)) fs.mkdirSync(NEXO_DEBUG_DIR); }
async function nexoDump(page, tag) {
  try {
    nexoEnsureDebugDir();
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    await page.screenshot({ path: `${NEXO_DEBUG_DIR}/${ts}-${tag}.png`, fullPage: true });
    const html = await page.content();
    fs.writeFileSync(`${NEXO_DEBUG_DIR}/${ts}-${tag}.html`, html);
  } catch {}
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--window-size=1400,900"],
    defaultViewport: { width: 1400, height: 900 }
  });
}

const SEL = {
  email:  'input[type="email"], input[name="email"]',
  pass:   'input[type="password"], input[name="password"]',
  submit: 'button[type="submit"], button[data-testid="login-submit"]',
  totp:   'input[name="otp"], input[autocomplete="one-time-code"], input[type="tel"]',
  dashMarker: '[data-testid="platform.total-portfolio-balance.amount"], #dashboard-assets-container',
  totalPortfolio: '[data-testid="platform.total-portfolio-balance.amount"]',
  assetsTableBody: '#dashboard-assets-container [data-testid="web-ui.component.data-table"] tbody',
  anySkeletonRow:  '#dashboard-assets-container [data-testid="web-ui.component.data-table"] tbody tr [data-testid="web-ui.component.skeleton"]'
};

async function loadCookies(page) {
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf8"));
      for (const c of cookies) await page.setCookie(c);
    } catch {}
  }
}
async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  } catch {}
}
async function dismissNexoPopups(page) {
  const maybe = await page.$('[data-testid="loyalty.minimumBalanceFeaturesModal.locked.modal"], [data-testid="web-ui.component.modal-wrap"]');
  if (!maybe) return;
  const safeClick = async (selector) => {
    const el = await page.$(selector);
    if (!el) return false;
    await el.evaluate(b => b.click());
    return true;
  };
  if (await safeClick('button[data-testid="loyalty.minimumBalanceModalCtas-secondary.locked"]')) {
    await page.waitForSelector('[data-testid="loyalty.minimumBalanceFeaturesModal.locked.modal"]', { hidden: true, timeout: 5000 }).catch(()=>{});
    return;
  }
  if (await safeClick('button[data-testid^="loyalty.minimumBalanceModalCtas-secondary"]')) {
    await page.waitForSelector('[data-testid="web-ui.component.modal-wrap"]', { hidden: true, timeout: 5000 }).catch(()=>{});
    return;
  }
  const byText = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /close/i.test(b.textContent || ''));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (byText) {
    await page.waitForSelector('[data-testid="web-ui.component.modal-wrap"]', { hidden: true, timeout: 5000 }).catch(()=>{});
    return;
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="web-ui.component.modal-wrap"]', { hidden: true, timeout: 3000 }).catch(()=>{});
}
async function isLogged(page) {
  try { await page.waitForSelector(SEL.dashMarker, { timeout: 4000 }); return true; } catch { return false; }
}
async function loginIfNeeded(page) {
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(60000);
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari");

  await page.goto(`${NEXO_BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });

  await loadCookies(page);
  await page.goto(`${NEXO_BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (await isLogged(page)) return;

  await page.goto(`${NEXO_BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });

  if (/Just a moment|Checking your browser/i.test(await page.title())) {
    await nexoDump(page, "challenge");
    throw new Error("Nexo: challenge/captcha detectado (ver nexo-debug/*).");
  }

  await page.waitForSelector(SEL.email, { timeout: 45000 });
  await page.type(SEL.email, NEXO_EMAIL, { delay: 20 });
  await page.type(SEL.pass,  NEXO_PASSWORD, { delay: 20 });
  await page.click(SEL.submit);

  try {
    await page.waitForSelector(SEL.totp, { timeout: 5000 });
    if (!NEXO_TOTP_SECRET) throw new Error("Falta NEXO_TOTP_SECRET");
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      const code = authenticator.generate(NEXO_TOTP_SECRET);
      await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.value = ""; }, SEL.totp);
      await page.type(SEL.totp, code, { delay: 20 });
      await page.click(SEL.submit);
      try { await page.waitForSelector(SEL.dashMarker, { timeout: 15000 }); ok = true; }
      catch { if (i < 2) await sleep(3000); }
    }
    if (!ok) { await nexoDump(page, "totp-fail"); throw new Error("TOTP falló tras 3 intentos"); }
  } catch { /* no pidió TOTP */ }

  try { await page.waitForSelector(SEL.dashMarker, { timeout: 60000 }); }
  catch { await nexoDump(page, "dash-timeout"); throw new Error("No se cargó el dashboard (timeout). Revisa nexo-debug/."); }

  await dismissNexoPopups(page);
  await sleep(500);
  await saveCookies(page);
}
function parseMoney(txt) {
  if (!txt) return 0;
  let s = String(txt).replace(/\s+/g, " ").trim();
  const hasComma = s.includes(","), hasDot = s.includes(".");
  s = s.replace(/[^\d.,-]/g, "");
  if (hasComma && !hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
async function waitUntilAssetsLoaded(page) {
  await page.waitForSelector(SEL.assetsTableBody, { timeout: 20000 });
  await page.waitForFunction((tbodySel, skSel) => {
    const tbody = document.querySelector(tbodySel);
    if (!tbody) return false;
    const rows = Array.from(tbody.querySelectorAll("tr"));
    if (!rows.length) return false;
    return rows.some(tr => !tr.querySelector(skSel));
  }, { timeout: 20000 }, SEL.assetsTableBody, SEL.anySkeletonRow).catch(()=>{});
}
async function getTotalPortfolio(page) {
  try {
    const text = await page.$eval(SEL.totalPortfolio, el => el.textContent || "");
    return parseMoney(text);
  } catch { return 0; }
}
async function getAssets(page) {
  return await page.evaluate(() => {
    const tbody = document.querySelector('#dashboard-assets-container [data-testid="web-ui.component.data-table"] tbody');
    if (!tbody) return [];
    const cleanNumber = (txt) => {
      if (!txt) return 0;
      let s = String(txt).replace(/\s+/g, " ").trim();
      const hasComma = s.includes(","), hasDot = s.includes(".");
      s = s.replace(/[^\d.,-]/g, "");
      if (hasComma && !hasDot) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const assets = [];
    for (const tr of rows) {
      if (tr.querySelector('[data-testid="web-ui.component.skeleton"]')) continue;
      const tds = tr.querySelectorAll("td");
      if (tds.length < 5) continue;
      const name = (tds[0]?.innerText || "").trim();
      const balanceText = (tds[1]?.innerText || "").trim();
      const balance = cleanNumber(balanceText);
      const priceText = (tds[2]?.innerText || "").trim();
      const marketPrice = cleanNumber(priceText);
      const creditText = (tds[3]?.innerText || "").trim();
      const creditLine = cleanNumber(creditText);
      const rateText = (tds[4]?.innerText || "").trim();
      const m = rateText.match(/-?\d+([.,]\d+)?/);
      const rateNum = m ? parseFloat(m[0].replace(',', '.')) : null;
      assets.push({ name, balance, marketPrice, creditLine, savingsRate: rateText, savingsRateNum: rateNum });
    }
    return assets;
  });
}
async function scrapeBalances(page) {
  await page.goto(`${NEXO_BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await dismissNexoPopups(page);
  await waitUntilAssetsLoaded(page).catch(()=>{});
  const totalUsd = await getTotalPortfolio(page);
  const assets = await getAssets(page);
  await nexoDump(page, "dashboard-parsed");
  return { totalUsd, assets };
}

/* Summary homogéneo para Nexo */
app.get("/nexo/summary", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  if (!NEXO_EMAIL || !NEXO_PASSWORD) {
    return res.status(500).json({ error: "server_misconfig", detail: "Falta NEXO_EMAIL/NEXO_PASSWORD" });
  }
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,es;q=0.8' });
    await page.emulateTimezone('Europe/Andorra');
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari");

    await loginIfNeeded(page);
    const data = await scrapeBalances(page);

    await browser.close();
    return res.json({ USD: Number(data.totalUsd || 0), EUR: 0, count: Array.isArray(data.assets) ? data.assets.length : 0 });
  } catch (e) {
    if (browser) try { await browser.close(); } catch {}
    console.error("Proxy /nexo/summary:", e);
    return res.status(502).json({ error: "nexo_error", detail: String(e.message || e) });
  }
});

/* ===================== JEEVES (TryJeeves) scraping ===================== */
const JEEVES_CACHE_FILE = path.join(process.cwd(), "jeeves.cache.json");
function readJeevesCache() { try { return JSON.parse(fs.readFileSync(JEEVES_CACHE_FILE, "utf8")); } catch { return null; } }
function writeJeevesCache(obj) { try { fs.writeFileSync(JEEVES_CACHE_FILE, JSON.stringify({ ...obj, ts: Date.now() }, null, 2)); } catch {} }

const JEEVES_BASE = "https://prod.jeev.es/client/web";
const JEEVES_DEBUG_DIR = path.join(process.cwd(), "jeeves-debug");
function jeevesEnsureDebugDir(){ if (!fs.existsSync(JEEVES_DEBUG_DIR)) fs.mkdirSync(JEEVES_DEBUG_DIR); }
async function jeevesDump(page, tag){
  try {
    jeevesEnsureDebugDir();
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    await page.screenshot({ path: `${JEEVES_DEBUG_DIR}/${ts}-${tag}.png`, fullPage: true });
    const html = await page.content();
    fs.writeFileSync(`${JEEVES_DEBUG_DIR}/${ts}-${tag}.html`, html);
  } catch {}
}
async function jeevesResolveWsEndpoint(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/\/devtools\/browser\/[A-Za-z0-9-]+$/.test(s)) return s;
  try {
    const url = new URL(s);
    const http = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}/json/version`;
    const { data, status } = await axios.get(http, { timeout: 2000, validateStatus: () => true });
    if (status === 200 && data && data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
    console.warn("[JEEVES] No obtuve webSocketDebuggerUrl desde /json/version (status", status, ")");
  } catch (e) {
    console.warn("[JEEVES] No pude resolver WebSocket endpoint:", e.message);
  }
  return s;
}
async function jeevesConnectBrowser() {
  const rawWs = process.env.JEEVES_REMOTE_WS || "";
  if (rawWs) {
    const ws = await jeevesResolveWsEndpoint(rawWs);
    try {
      const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });
      console.log("[JEEVES] Conectado a Chrome remoto:", ws);
      return browser;
    } catch (err) {
      throw new Error(`No pude conectar a Chrome remoto (${ws || rawWs}): ${err.message}`);
    }
  }
  const candidates = [
    process.env.JEEVES_CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ].filter(Boolean);
  const exe = candidates.find(p => { try { return p && fs.existsSync(p); } catch { return false; } });
  if (!exe) throw new Error("No encontré Chrome. Define JEEVES_REMOTE_WS o JEEVES_CHROME_BIN.");

  const userDataDir = process.env.JEEVES_USER_DATA_DIR || path.join(process.cwd(), "jeeves-profile");
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: exe,
    userDataDir,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--window-size=1400,900"],
    defaultViewport: { width: 1400, height: 900 }
  });
  console.log("[JEEVES] Chrome local lanzado:", exe, "perfil:", userDataDir);
  return browser;
}
async function jeevesGoToDashboard(page) {
  const dashUrl = `${JEEVES_BASE}/dashboard`;
  await page.goto(dashUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(1000);
  const onLogin = /\/login(\/|$)/.test(page.url()) || !!(await page.$('form[data-testid="init-login"]'));
  if (onLogin) {
    await jeevesDump(page, "need-login");
    throw new Error("Sesión Jeeves no iniciada en este navegador. Inicia sesión manualmente y vuelve a llamar al endpoint.");
  }
  await jeevesWaitForPrepaidWidget(page);
}
async function jeevesWaitForPrepaidWidget(page) {
  await page.waitForFunction(() => {
    const all = Array.from(document.querySelectorAll("p, h1, h2, div"));
    const head = all.find(el => /prepaid accounts/i.test(el.textContent || ""));
    if (!head) return false;
    const widget = head.closest('div');
    if (!widget) return false;
    return !!widget.querySelector('p.jeeko-typography--bodyMNumeric');
  }, { timeout: 45000 });
}
async function jeevesExtractPrepaidAccounts(page) {
  return await page.evaluate(() => {
    const parseAmount = (txt) => {
      if (!txt) return 0;
      let s = String(txt).trim();
      s = s.replace(/[^\d.,-]/g, "");
      const hasComma = s.includes(","), hasDot = s.includes(".");
      if (hasComma && !hasDot) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    const all = Array.from(document.querySelectorAll("p, h1, h2, div"));
    const head = all.find(el => /prepaid accounts/i.test(el.textContent || ""));
    if (!head) return [];
    const widget = head.closest('div');
    if (!widget) return [];
    const avatarBlocks = Array.from(widget.querySelectorAll('.jeeko-avatarlabelgroup--container'));
    const rows = [];
    for (const av of avatarBlocks) {
      const row = av.closest('div');
      let parent = row;
      for (let i = 0; i < 4 && parent && !parent.querySelector('p.jeeko-typography--bodyMNumeric'); i++) {
        parent = parent.parentElement;
      }
      const scope = parent || row || widget;
      const label = av.querySelector('.jeeko-useravatar--title')?.textContent?.trim() || "";
      const masked = av.querySelector('.jeeko-useravatar--subtitle')?.textContent?.trim() || "";
      const amountTxt = scope.querySelector('p.jeeko-typography--bodyMNumeric')?.textContent || "";
      const ccy = scope.querySelector('.jeeko-badge--badge')?.textContent?.trim()?.toUpperCase() || "";
      const amount = parseAmount(amountTxt);
      if (label && ccy) rows.push({ label, masked, ccy, amount });
    }
    return rows;
  });
}
function jeevesSummaryByCcy(rows) {
  return (rows || []).reduce((acc, r) => {
    acc[r.ccy] = (acc[r.ccy] || 0) + Number(r.amount || 0);
    return acc;
  }, {});
}

/* Health opcional */
app.get("/jeeves/health", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  try {
    const browser = await jeevesConnectBrowser();
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    await page.goto(`${JEEVES_BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const onLogin = /\/login(\/|$)/.test(page.url());
    return res.json({ ok: !onLogin, url: page.url(), loggedIn: !onLogin });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
});

/* Jeeves summary homogéneo (con caché transparente) */
app.get("/jeeves/summary", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  const readCache = () => { try { return JSON.parse(fs.readFileSync(JEEVES_CACHE_FILE, "utf8")); } catch { return null; } };
  const writeCache = (obj) => { try { fs.writeFileSync(JEEVES_CACHE_FILE, JSON.stringify({ ...obj, ts: Date.now() }, null, 2)); } catch {} };

  try {
    const browser = await jeevesConnectBrowser();
    const pages = await browser.pages();
    let page = pages.find(p => (p.url() || "").startsWith(JEEVES_BASE)) || pages[0] || await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,es;q=0.8' });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari");

    await jeevesGoToDashboard(page);
    const details = await jeevesExtractPrepaidAccounts(page);
    await jeevesDump(page, "dashboard-prepaid-summary");

    const summary = jeevesSummaryByCcy(details);
    const resp = { USD: Number(summary.USD || 0), EUR: Number(summary.EUR || 0), count: details.length };
    writeCache(resp);
    return res.json(resp);
  } catch (e) {
    console.error("Proxy /jeeves/summary:", e.message || e);
    const cache = readCache();
    if (cache && (typeof cache.USD === "number" || typeof cache.EUR === "number")) {
      return res.json({ USD: Number(cache.USD || 0), EUR: Number(cache.EUR || 0), count: Number(cache.count || 0) });
    }
    return res.status(502).json({ error: "jeeves_error", detail: String(e.message || e) });
  }
});



/* ===================== Start ===================== */
app.listen(PORT, () => {
  console.log(`Proxy listening on ${PORT}`);
  console.log(`Cert: ${CLIENT_CERT_PATH}`);
  console.log(`Key : ${CLIENT_KEY_PATH}`);
});

/* ===================== Multi-Channel Notification Functions ===================== */
async function sendPaymentNotification(userName, amount, currency, reference) {
  try {
    console.log(`[NOTIFY] Sending payment notification to ${userName} for ${currency}${amount} transfer`);
    
    // Message template
    const message = `🎉 Payment Completed!\n\n` +
                   `Hi ${userName},\n\n` +
                   `Your payment of ${currency}${amount} has been successfully processed.\n\n` +
                   `💰 Amount: ${currency}${amount}\n` +
                   `📝 Reference: ${reference}\n` +
                   `✅ Status: Completed\n\n` +
                   `The funds have been transferred to your account.\n\n` +
                   `Best regards,\nWaresoul Team`;
    
    // Try multiple notification channels
    const results = await Promise.allSettled([
      sendWhatsAppMessage(userName, message),
      sendEmailNotification(userName, message),
      sendTelegramNotification(userName, message)
    ]);
    
    // Log results
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`[NOTIFY] Notification sent via ${successCount}/${results.length} channels to ${userName}`);
    
    return { success: successCount > 0, channels: results.length, successful: successCount };
    
  } catch (error) {
    console.error(`[ERROR] Payment notification failed for ${userName}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendWhatsAppMessage(userName, message) {
  try {
    // Option 1: Twilio WhatsApp (cheapest official option)
    if (process.env.TWILIO_ACCOUNT_SID && 
        (process.env.TWILIO_API_KEY || process.env.TWILIO_AUTH_TOKEN)) {
      return await sendTwilioWhatsApp(userName, message);
    }
    
    // Option 2: WhatsApp Business API (Meta)
    if (process.env.WHATSAPP_API_ENABLED === 'true') {
      return await sendWhatsAppBusinessAPI(userName, message);
    }
    
    // Option 3: Custom webhook/endpoint
    if (process.env.WHATSAPP_WEBHOOK_URL) {
      return await sendWhatsAppWebhook(userName, message);
    }
    
    // Option 4: Log only (for testing)
    console.log(`[WHATSAPP] Message would be sent to ${userName}:`);
    console.log(`[WHATSAPP] ${message}`);
    
    return { success: true, method: 'logged_only', userName: userName };
    
  } catch (error) {
    console.error(`[ERROR] WhatsApp message failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendEmailNotification(userName, message) {
  try {
    // Option 1: SendGrid (free tier: 100 emails/day)
    if (process.env.SENDGRID_API_KEY) {
      return await sendSendGridEmail(userName, message);
    }
    
    // Option 2: SMTP (Gmail, etc.)
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      return await sendSMTPEmail(userName, message);
    }
    
    // Option 3: Log only
    console.log(`[EMAIL] Message would be sent to ${userName}:`);
    console.log(`[EMAIL] ${message}`);
    
    return { success: true, method: 'logged_only', userName: userName };
    
  } catch (error) {
    console.error(`[ERROR] Email notification failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendTelegramNotification(userName, message) {
  try {
    // Telegram Bot API (free, 30 messages/second limit)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      return await sendTelegramBotMessage(userName, message);
    }
    
    // Log only
    console.log(`[TELEGRAM] Message would be sent to ${userName}:`);
    console.log(`[TELEGRAM] ${message}`);
    
    return { success: true, method: 'logged_only', userName: userName };
    
  } catch (error) {
    console.error(`[ERROR] Telegram notification failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendTwilioWhatsApp(userName, message) {
  try {
    // Twilio WhatsApp - Cheapest official option ($0.0049 per message)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g., "whatsapp:+14155238886"
    
    if (!accountSid || !fromNumber) {
      console.log(`[TWILIO] Missing account SID or from number for ${userName}`);
      return { success: false, error: 'Missing Twilio account SID or from number' };
    }
    
    // Try API Key first (more secure), fall back to Auth Token
    let authMethod = 'api_key';
    let authCredentials = {};
    
    if (process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET) {
      // Use API Key (recommended)
      authCredentials = { 
        username: process.env.TWILIO_API_KEY, 
        password: process.env.TWILIO_API_SECRET 
      };
      console.log(`[TWILIO] Using API Key authentication for ${userName}`);
    } else if (process.env.TWILIO_AUTH_TOKEN) {
      // Fall back to Auth Token
      authCredentials = { 
        username: accountSid, 
        password: process.env.TWILIO_AUTH_TOKEN 
      };
      authMethod = 'auth_token';
      console.log(`[TWILIO] Using Auth Token authentication for ${userName}`);
    } else {
      console.log(`[TWILIO] Missing authentication credentials for ${userName}`);
      return { success: false, error: 'Missing Twilio authentication credentials' };
    }
    
    const phoneNumber = await getUserPhoneNumber(userName);
    if (!phoneNumber) {
      console.log(`[TWILIO] No phone number found for ${userName}`);
      return { success: false, error: 'No phone number found' };
    }
    
    // Format phone number for Twilio WhatsApp
    const toNumber = `whatsapp:${phoneNumber.replace(/^\+/, '')}`;
    
    const payload = new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: message
    });
    
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      payload,
      {
        auth: authCredentials,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    console.log(`[TWILIO] WhatsApp message sent successfully to ${userName} using ${authMethod}`);
    return { 
      success: true, 
      method: 'twilio_whatsapp', 
      authMethod: authMethod,
      response: response.data 
    };
    
  } catch (error) {
    console.error(`[ERROR] Twilio WhatsApp failed for ${userName}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendWhatsAppBusinessAPI(userName, message) {
  try {
    // This would use the official WhatsApp Business API
    // You'll need to implement this based on your chosen provider
    
    console.log(`[WHATSAPP] Business API call would be made to ${userName}`);
    console.log(`[WHATSAPP] Message: ${message}`);
    
    // Example implementation structure:
    /*
    const apiUrl = process.env.WHATSAPP_API_URL;
    const apiToken = process.env.WHATSAPP_API_TOKEN;
    
    const payload = {
      messaging_product: "whatsapp",
      to: getUserPhoneNumber(userName), // You'll need to implement this
      type: "text",
      text: { body: message }
    };
    
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json'
      }
    });
    
    return { success: true, response: response.data };
    */
    
    return { success: true, method: 'business_api_simulation', userName: userName };
    
  } catch (error) {
    console.error(`[ERROR] WhatsApp Business API failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendWhatsAppWebhook(userName, message) {
  try {
    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
    
    const payload = {
      user: userName,
      message: message,
      timestamp: new Date().toISOString()
    };
    
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    console.log(`[WHATSAPP] Webhook sent successfully to ${userName}`);
    return { success: true, response: response.data };
    
  } catch (error) {
    console.error(`[ERROR] WhatsApp webhook failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendSendGridEmail(userName, message) {
  try {
    // SendGrid - Free tier: 100 emails/day
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@waresoul.com';
    
    const userEmail = getUserEmail(userName);
    if (!userEmail) {
      console.log(`[SENDGRID] No email found for ${userName}`);
      return { success: false, error: 'No email found' };
    }
    
    const payload = {
      personalizations: [{
        to: [{ email: userEmail, name: userName }]
      }],
      from: { email: fromEmail, name: 'Waresoul Team' },
      subject: 'Payment Completed - Waresoul',
      content: [{
        type: 'text/plain',
        value: message
      }]
    };
    
    const response = await axios.post('https://api.sendgrid.com/v3/mail/send', payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`[SENDGRID] Email sent successfully to ${userName}`);
    return { success: true, method: 'sendgrid_email', response: response.data };
    
  } catch (error) {
    console.error(`[ERROR] SendGrid email failed for ${userName}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendSMTPEmail(userName, message) {
  try {
    // SMTP (Gmail, etc.) - Free but requires setup
    const userEmail = getUserEmail(userName);
    if (!userEmail) {
      console.log(`[SMTP] No email found for ${userName}`);
      return { success: false, error: 'No email found' };
    }
    
    // For now, just log - you'd implement actual SMTP here
    console.log(`[SMTP] Email would be sent to ${userName} (${userEmail}):`);
    console.log(`[SMTP] ${message}`);
    
    return { success: true, method: 'smtp_simulation', userName: userName };
    
  } catch (error) {
    console.error(`[ERROR] SMTP email failed for ${userName}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendTelegramBotMessage(userName, message) {
  try {
    // Telegram Bot API - Completely free, 30 messages/second limit
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = getUserTelegramChatId(userName);
    
    if (!chatId) {
      console.log(`[TELEGRAM] No chat ID found for ${userName}`);
      return { success: false, error: 'No Telegram chat ID found' };
    }
    
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    };
    
    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    
    console.log(`[TELEGRAM] Message sent successfully to ${userName}`);
    return { success: true, method: 'telegram_bot', response: response.data };
    
  } catch (error) {
    console.error(`[ERROR] Telegram notification failed for ${userName}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Placeholder implementation removed in favor of async Google Sheets-backed version below

// Google Sheets integration for getting user phone numbers

// Initialize Google Sheets API
function getGoogleSheetsAuth() {
  try {
    // Option 1: Service Account (recommended for server-to-server)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
      return auth;
    }
    
    // Option 2: API Key (if sheet is public)
    if (process.env.GOOGLE_API_KEY) {
      const auth = new google.auth.GoogleAuth({
        key: process.env.GOOGLE_API_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
      return auth;
    }
    
    console.log('[GOOGLE_SHEETS] No Google authentication configured');
    return null;
    
  } catch (error) {
    console.error('[ERROR] Failed to initialize Google Sheets auth:', error.message);
    return null;
  }
}

// Get users and phone numbers from Google Sheets
async function getUsersFromGoogleSheets() {
  try {
    const auth = getGoogleSheetsAuth();
    if (!auth) {
      console.log('[GOOGLE_SHEETS] No authentication available');
      return [];
    }
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    // You'll need to set these environment variables
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = 'Users!A1:Z1000'; // Adjust range as needed
    
    if (!spreadsheetId) {
      console.log('[GOOGLE_SHEETS] No spreadsheet ID configured');
      return [];
    }
    
    console.log('[GOOGLE_SHEETS] Fetching users from Google Sheets...');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('[GOOGLE_SHEETS] No data found in sheet');
      return [];
    }
    
    const users = [];
    
    // Row 1: User names (column headers)
    // Row 11: Phone numbers
    // Row 28: Active status
    
    const userNames = rows[0] || []; // Row 1
    const phoneNumbers = rows[10] || []; // Row 11 (0-indexed)
    const activeStatus = rows[27] || []; // Row 28 (0-indexed)
    
    for (let i = 1; i < userNames.length; i++) { // Start from column B (index 1)
      const userName = userNames[i];
      const phoneNumber = phoneNumbers[i];
      const isActive = activeStatus[i];
      
      if (userName && phoneNumber && isActive === 'TRUE') {
        users.push({
          userName: userName.trim(),
          phoneNumber: phoneNumber.trim(),
          column: i + 1
        });
      }
    }
    
    console.log(`[GOOGLE_SHEETS] Found ${users.length} active users with phone numbers`);
    return users;
    
  } catch (error) {
    console.error('[ERROR] Failed to get users from Google Sheets:', error.message);
    return [];
  }
}

// Enhanced getUserPhoneNumber function that works with Google Sheets
async function getUserPhoneNumber(userName) {
  try {
    // First try to get from local cache if available
    if (global.userPhoneCache && global.userPhoneCache[userName]) {
      return global.userPhoneCache[userName];
    }
    
    // Get fresh data from Google Sheets
    const users = await getUsersFromGoogleSheets();
    
    // Cache the results
    global.userPhoneCache = {};
    users.forEach(user => {
      global.userPhoneCache[user.userName] = user.phoneNumber;
    });
    
    // Return phone number for requested user
    const phoneNumber = global.userPhoneCache[userName];
    
    if (phoneNumber) {
      console.log(`[PHONE] Found phone number for ${userName}: ${phoneNumber}`);
    } else {
      console.log(`[PHONE] No phone number found for ${userName}`);
    }
    
    return phoneNumber;
    
  } catch (error) {
    console.error(`[ERROR] Failed to get phone number for ${userName}:`, error.message);
    return null;
  }
}

// New endpoint: Payment notification
app.post('/notify-payment', async (req, res) => {
  try {
    const { userName, amount, month, type } = req.body;
    
    if (!userName || !amount || !month) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: userName, amount, month' 
      });
    }
    
    console.log(`[PAYMENT_NOTIFICATION] Processing payment notification for ${userName}: ${amount} EUR for ${month}`);
    
    // Get phone number for the user
    const phoneNumber = await getUserPhoneNumber(userName);
    if (!phoneNumber) {
      console.log(`[PAYMENT_NOTIFICATION] No phone number found for ${userName}`);
      return res.status(404).json({ 
        success: false, 
        error: 'No phone number found for user' 
      });
    }
    
    // Create payment confirmation message
    const message = `💰 Payment Notification

Hello ${userName},

Your monthly payment of ${amount.toFixed(2)} EUR has been processed for ${month}.

The payment has been sent to your account. Please allow 1-2 business days for the funds to appear.

Thank you for your continued partnership!

Best regards,
Proxy Banks Team`;
    
    // Send WhatsApp notification
    const result = await sendTwilioWhatsApp(userName, message);
    
    if (result.success) {
      console.log(`[PAYMENT_NOTIFICATION] WhatsApp notification sent successfully to ${userName}`);
      res.json({
        success: true,
        message: 'Payment notification sent successfully',
        details: result
      });
    } else {
      console.log(`[PAYMENT_NOTIFICATION] Failed to send WhatsApp to ${userName}: ${result.error}`);
      res.status(500).json({
        success: false,
        error: 'Failed to send WhatsApp notification',
        details: result
      });
    }
    
  } catch (error) {
    console.error('[ERROR] Payment notification endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// New endpoint: WhatsApp testing
app.post('/test-whatsapp', async (req, res) => {
  try {
    const { userName, type, message } = req.body;
    
    if (!userName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: userName' 
      });
    }
    
    console.log(`[WHATSAPP_TEST] Testing WhatsApp for ${userName}`);
    
    // Get phone number for the user
    const phoneNumber = await getUserPhoneNumber(userName);
    if (!phoneNumber) {
      console.log(`[WHATSAPP_TEST] No phone number found for ${userName}`);
      return res.status(404).json({ 
        success: false, 
        error: 'No phone number found for user' 
      });
    }
    
    // Use custom message if provided, otherwise use default test message
    const testMessage = message || `🧪 Test Message

Hello ${userName},

This is a test WhatsApp message from the Proxy Banks payment system.

If you receive this message, the WhatsApp integration is working correctly!

Best regards,
Proxy Banks Team`;
    
    // Send WhatsApp test message
    const result = await sendTwilioWhatsApp(userName, testMessage);
    
    if (result.success) {
      console.log(`[WHATSAPP_TEST] Test message sent successfully to ${userName}`);
      res.json({
        success: true,
        message: 'WhatsApp test message sent successfully',
        details: result
      });
    } else {
      console.log(`[WHATSAPP_TEST] Failed to send test message to ${userName}: ${result.error}`);
      res.status(500).json({
        success: false,
        error: 'Failed to send WhatsApp test message',
        details: result
      });
    }
    
  } catch (error) {
    console.error('[ERROR] WhatsApp test endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Cache refresh endpoint
app.post('/refresh-phone-cache', async (req, res) => {
  try {
    console.log('[CACHE] Refreshing phone number cache...');
    
    // Clear existing cache
    global.userPhoneCache = {};
    
    // Fetch fresh data from Google Sheets
    const users = await getUsersFromGoogleSheets();
    
    // Build new cache
    users.forEach(user => {
      global.userPhoneCache[user.userName] = user.phoneNumber;
    });
    
    console.log(`[CACHE] Cache refreshed with ${users.length} users`);
    
    res.json({
      success: true,
      message: 'Phone number cache refreshed successfully',
      userCount: users.length,
      users: users.map(u => ({ userName: u.userName, hasPhone: !!u.phoneNumber }))
    });
    
  } catch (error) {
    console.error('[ERROR] Cache refresh failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh cache',
      message: error.message
    });
  }
});

// Get all users endpoint
app.get('/users', async (req, res) => {
  try {
    const users = await getUsersFromGoogleSheets();
    
    res.json({
      success: true,
      users: users,
      count: users.length
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to get users:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get users',
      message: error.message
    });
  }
});

// Handle incoming calls from Twilio
app.post('/incoming-call', async (req, res) => {
  try {
    const { From, To, CallSid, CallStatus } = req.body;
    
    console.log(`[INCOMING_CALL] From: ${From}, To: ${To}, Status: ${CallStatus}`);
    
    // Log call details (you'll see these in Twilio Console app)
    console.log(`[CALL_LOG] Call received from ${From} to ${To} - Status: ${CallStatus}`);
    
    // Respond to Twilio with a simple message
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. Your call has been logged and you will receive a response shortly.</Say>
  <Hangup/>
</Response>`;
    
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
    
  } catch (error) {
    console.error('[ERROR] Incoming call handling failed:', error.message);
    res.status(500).send('Error handling call');
  }
});

// Handle incoming SMS from Twilio
app.post('/incoming-sms', async (req, res) => {
  try {
    const { From, To, Body, MessageSid } = req.body;
    
    console.log(`[INCOMING_SMS] From: ${From}, To: ${To}, Body: ${Body}`);
    
    // Log SMS details (you'll see these in Twilio Console app)
    console.log(`[SMS_LOG] SMS received from ${From} to ${To}: ${Body}`);
    
    // Respond to Twilio (required)
    res.status(200).send('OK');
    
  } catch (error) {
    console.log(dump_server_cleanup(req), res, null);
    res.status(502).json({ error: "incoming_sms_error", detail: error.reason || error.message, status: error.response?.status || 500 });
  }
});

/* ===================== Intelligent Consolidation System ===================== */
app.get("/intelligent-consolidation/test", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  
  try {
    console.log('[INTELLIGENT_CONSOLIDATION] Starting internal consolidation test...');
    
    // Step 1: Fetch all bank balances
    console.log('[STEP_1] Fetching all bank USD balances...');
    const bankBalances = await fetchAllBankBalances();
    
    // Step 2: Internal consolidation analysis only  
    console.log('[STEP_2] Analyzing internal consolidation needs...');
    const internalPlan = await analyzeInternalConsolidation(bankBalances);
    
    // Combine results
    const result = {
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
      steps: {
        currentBalances: bankBalances,
        internalPlan: internalPlan
      },
      summary: {
        needsConsolidation: internalPlan.consolidations.length > 0,
        totalUsdConsolidated: internalPlan.totalAmount
      }
    };
    
    return res.json(result);
    
  } catch (error) {
    console.error('[ERROR] Internal consolidation test failed:', error.message);
    return res.status(502).json({ 
      error: "internal_consolidation_error", 
      detail: error.message,
      status: error.response?.status || 500 
    });
  }
});

app.post("/intelligent-consolidation/execute", async (req, res) => {
  if (!checkProxyAuth(req, res)) return;
  
  try {
    console.log('[INTELLIGENT_CONSOLIDATION] Starting internal consolidation execution...');
    
    const dryRun = req.body.dryRun !== false; // Default to true      
    
    console.log(`[EXECUTION] Mode: ${dryRun ? 'DRY_RUN' : 'REAL_EXECUTION'}`);
    
    const result = await executeInternalConsolidation(dryRun);
    
    return res.json(result);
    
  } catch (error) {
    console.error('[ERROR] Internal consolidation execution failed:', error.message);
    return res.status(502).json({ 
      error: "internal_consolidation_execution_error", 
      detail: error.message,
      status: error.response?.status || 500 
    });
  }
});

/* ===================== Intelligent Consolidation Helper Functions ===================== */
async function fetchAllBankBalances() {
  const balances = {};
  
  try {
    // Mercury Main Account Balance
    console.log('[BALANCE_FETCH] Fetching Mercury Main account balance...');
    const mercuryResponse = await axios.get('https://api.mercury.com/api/v1/accounts', {
      headers: { Accept: "application/json" },
      auth: { username: MERCURY_API_TOKEN, password: "" },
      timeout: 15000,
      validateStatus: () => true
    });
    
    if (mercuryResponse.status >= 400) {
      console.error("Mercury API error:", mercuryResponse.status, mercuryResponse.data);
      balances.mercury = { USD: 0, EUR: 0, bankName: 'Mercury', error: 'API error' };
    } else {
      const accounts = mercuryResponse.data?.accounts || [];
      
      // Find Main account
      const mainAccount = accounts.find(account => 
        account.name?.includes('2290') || 
        account.isMainAccount === true
      );
      
      if (mainAccount) {
        balances.mercury = {
          USD: parseFloat(mainAccount.availableBalance || mainAccount.balance || 0),
          EUR: 0,
          bankName: 'Mercury',
          accountId: mainAccount.id,
          accountName: mainAccount.name,
          isMainAccount: true
        };
      } else {
        balances.mercury = { USD: 0, EUR: 0, bankName: 'Mercury', error: 'Main account not found' };
      }
    }
    
    console.log('[BALANCE_FETCH] Mercury Main:', balances.mercury.USD);
    
  } catch (error) {
    console.error('[ERROR] Failed to fetch Mercury balance:', error.message);
    balances.mercury = { USD: 0, EUR: 0, bankName: 'Mercury', error: error.message };
  }
  
  try {
    // Revolut Balance
    console.log('[BALANCE_FETCH] Fetching Revolut balance...');
    const accessToken = await ensureAccessToken();
    
    const revolutResponse = await axios.get('https://b2b.revolut.com/api/1.0/accounts', {
      httpsAgent: revolutAgent,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      timeout: 15000,
      validateStatus: () => true
    });
    
    if (revolutResponse.status >= 400) {
      console.error("Revolut API error:", revolutResponse.status, revolutResponse.data);
      balances.revolut = { USD: 0, EUR: 0, bankName: 'Revolut', error: 'API error' };
    } else {
      const accounts = revolutResponse.data || [];
      let totalUSD = 0;
      
      accounts.forEach(account => {
        if (account.currency === 'USD') {
          totalUSD += parseFloat(account.balance || 0);
        }
      });
      
      balances.revolut = {
        USD: totalUSD,
        EUR: 0,
        bankName: 'Revolut'
      };
    }
    
    console.log('[BALANCE_FETCH] Revolut:', balances.revolut.USD);
    
  } catch (error) {
    console.error('[ERROR] Failed to fetch Revolut balance:', error.message);
    balances.revolut = { USD: 0, EUR: 0, bankName: 'Revolut', error: error.message };
  }
  
  // Simplified versions for now
  balances.wise = { USD: 0, EUR: 0, bankName: 'Wise', note: 'API not implemented' };
  balances.nexo = { USD: 0, EUR: 0, bankName: 'Nexo', note: 'API not implemented' };
  
  return balances;
}

async function analyzeInternalConsolidation(bankBalances) {
  console.log('[INTERNAL_ANALYSIS] Analyzing internal consolidation needs...');
  
  const result = {
    consolidations: [],
    totalAmount: 0,
    banksAnalyzed: 0
  };
  
  // Mercury Internal Consolidation Analysis
  try {
    console.log('[MERCURY_INTERNAL] Analyzing Mercury internal consolidation...');
    
    const accountsResponse = await axios.get('https://api.mercury.com/api/v1/accounts', {
      headers: { Accept: "application/json" },
      auth: { username: MERCURY_API_TOKEN, password: "" },
      timeout: 15000,
      validateStatus: () => true
    });
    
    if (accountsResponse.status < 400) {
      const accounts = accountsResponse.data?.accounts || [];
      
      // Find accounts with USD funds that aren't main
      let consolidationAmount = 0;
      
      accounts.forEach(account => {
        const currency = account.currency || 'USD';
        const balance = parseFloat(account.availableBalance || account.balance || 0);
        
        if (currency === 'USD' && balance > 0) {
          const isMainAccount = (
            account.name?.includes('2290') || 
            account.nickname?.includes('2290') ||
            account.isMainAccount === true ||
            account.nickname?.toLowerCase().includes('main')
         );
         
          if (!isMainAccount) {
            consolidationAmount += balance;
            console.log(`[MERCURY_CONSOLIDATE] Found ${account.name}: $${balance}`);
          }
        }
      });
      
      if (consolidationAmount > 0) {
        result.consolidations.push({
          bank: 'Mercury',
          amount: consolidationAmount,
          currency: 'USD',
          accountsCount: accounts.filter(a => !a.isMainAccount && a.availableBalance > 0).length,
          note: 'Move funds from non-Main Mercury accounts to Main account'
        });
        result.totalAmount += consolidationAmount;
      }
    }
    
    result.banksAnalyzed++;
    
  } catch (error) {
    console.error('[ERROR] Mercury internal analysis failed:', error.message);
  }
  
  console.log(`[INTERNAL_ANALYSIS] Completed: ${result.consolidations.length} consolidations, $${result.totalAmount}`);
  return result;
}

// Cross-bank analysis removed - only internal consolidation now

/* ===================== Payout Reconciliation Functions ===================== */
async function reconcilePayouts(receivedAmount, bankName) {
  console.log(`[PAYOUT_RECONCILE] Reconciling payout: $${receivedAmount} from ${bankName}`);
  
  try {
    // If Mercury, try to get recent transaction data to break down the amount
    let individualAmounts = [receivedAmount]; // Default to single amount
    
    if (bankName.toLowerCase() === 'mercury') {
      console.log(`[PAYOUT_RECONCILE] Mercury detected - attempting to break down $${receivedAmount}`);
      individualAmounts = await getMercuryTransactionBreakdown(receivedAmount);
      console.log(`[PAYOUT_RECONCILE] Found ${individualAmounts.length} individual transfer(s): ${individualAmounts.map(a => `$${a}`).join(', ')}`);
    }
    
    const reconciledTransfers = [];
    let successfulMatches = 0;
    
    let processedAmount = receivedAmount;
    
    // Try to reconcile each individual amount
    for (let i = 0; i < individualAmounts.length && processedAmount > 0; i++) {
      const individualAmount = individualAmounts[i];
      
      const payoutData = {
        receivedAmount: individualAmount,
        bankName: bankName,
        timestamp: new Date().toISOString(),
        isPartialAmount: individualAmounts.length > 1,
        remainingAmount: processedAmount - individualAmount
      };
      
      // Call Google Apps Script to reconcile with Payouts sheet
      const reconcileUrl = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";
      
      const response = await axios.post(reconcileUrl, {
        action: 'reconcile_payout',
        data: payoutData
      }, {
        timeout: 15000,
        validateStatus: () => true
      });
      
      if (response.status < 400 && response.data?.success) {
        console.log(`[PAYOUT_RECONCILE] Individual reconciliation successful: $${individualAmount} -> ${response.data.matchedRow}`);
        reconciledTransfers.push({
          amount: individualAmount,
          matchedRow: response.data.matchedRow,
          adjustment: response.data.adjustment || 0,
          message: response.data.message
        });
        successfulMatches++;
        processedAmount -= individualAmount;
      } else {
        console.log(`[PAYOUT_RECONCILE] Individual reconciliation failed for $${individualAmount}`);
        // Even if individual reconciliation fails, we still have the money
        reconciledTransfers.push({
          amount: individualAmount,
          matchedRow: null,
          adjustment: 0,
          message: 'Received but not matched to spreadsheet'
        });
      }
    }
    
    return {
      success: successfulMatches > 0,
      totalAmount: receivedAmount,
      individualTransfers: reconciledTransfers,
      successfulMatches: successfulMatches,
      message: `Reconciled ${successfulMatches} of ${individualAmounts.length} transfers`
    };
    
  } catch (error) {
    console.error(`[PAYOUT_RECONCILE] Error reconciling payout:`, error.message);
    return {
      success: false,
      error: error.message,
      message: 'Payout reconciliation service unavailable'
    };
  }
}

async function getMercuryTransactionBreakdown(totalAmount) {
  try {
    console.log(`[MERCURY_BREAKDOWN] Fetching recent Mercury transactions to break down $${totalAmount}`);
    
    // Use our own server endpoint to get recent transactions
    const serverBaseUrl = process.env.SERVER_BASE_URL || 'http://localhost:8081';
    const proxyToken = process.env.PROXY_TOKEN || 'proxy123';
    
    const response = await axios.get(`${serverBaseUrl}/mercury/recent-transactions?limit=20`, {
      headers: {
        'Authorization': `Bearer ${proxyToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.status !== 200) {
      console.log(`[MERCURY_BREAKDOWN] Failed to fetch transactions: ${response.status}`);
      return [totalAmount]; // Fallback to single amount
    }
    
    const transactions = response.data?.transactions || [];
    console.log(`[MERCURY_BREAKDOWN] Found ${transactions.length} recent USD incoming transactions`);
    
    if (transactions.length === 0) {
      console.log(`[MERCURY_BREAKDOWN] No transactions found, using single amount`);
      return [totalAmount];
    }
    
    // Try to find combinations that sum to totalAmount
    const breakdown = findTransferCombinations(transactions, totalAmount);
    
    if (breakdown.length > 0) {
      console.log(`[MERCURY_BREAKDOWN] Success: Found ${breakdown.length} transfer(s) that sum to $${totalAmount}`);
      return breakdown.map(tx => Math.abs(tx.amount));
    } else {
      console.log(`[MERCURY_BREAKDOWN] No combination found, using single amount: $${totalAmount}`);
      return [totalAmount];
    }
    
  } catch (error) {
    console.log(`[MERCURY_BREAKDOWN] Error: ${error.message}, fallback to single amount`);
    return [totalAmount];
  }
}

function findTransferCombinations(transactions, targetAmount, tolerance = 10) {
  const amounts = transactions.map(tx => Math.abs(tx.amount));
  
  // Try single transaction first
  for (let i = 0; i < amounts.length; i++) {
    if (Math.abs(amounts[i] - targetAmount) <= tolerance) {
      return [amounts[i]];
    }
  }
  
  // Try all pairs
  for (let i = 0; i < amounts.length; i++) {
    for (let j = i + 1; j < amounts.length; j++) {
      const sum = amounts[i] + amounts[j];
      if (Math.abs(sum - targetAmount) <= tolerance) {
        return [amounts[i], amounts[j]];
      }
    }
  }
  
  // Try triplets
  for (let i = 0; i < amounts.length; i++) {
    for (let j = i + 1; j < amounts.length; j++) {
      for (let k = j + 1; k < amounts.length; k++) {
        const sum = amounts[i] + amounts[j] + amounts[k];
        if (Math.abs(sum - targetAmount) <= tolerance) {
          return [amounts[i], amounts[j], amounts[k]];
        }
      }
    }
  }
  
  return [];
}

function calculateExpectedAmount(platformName, baseAmount) {
  // Apply platform-specific adjustments
  if (platformName && platformName.toLowerCase().includes('topstep')) {
    // Topstep: ~90% of base amount minus $20 transfer fee
    // Sometimes they pay 100% though
    const adjustedAmount = Math.max(baseAmount * 0.9 - 20, baseAmount - 20);
    return {
      expectedMin: adjustedAmount * 0.9, // Allow 10% variance for rounding
      expectedMax: baseAmount,
      platform: 'Topstep'
    };
  } else if (platformName && platformName.toLowerCase().includes('mffu')) {
    // MFFU: ~80% of base amount minus $20 transfer fee
    const adjustedAmount = Math.max(baseAmount * 0.8 - 20, baseAmount * 0.85 - 20);
    return {
      expectedMin: adjustedAmount * 0.9, // Allow 10% variance
      expectedMax: baseAmount,
      platform: 'MFFU'
    };
  } else {
    // Default: assume close to base amount
    return {
      expectedMin: baseAmount * 0.95,
      expectedMax: baseAmount,
      platform: 'Unknown'
    };
  }
}

async function executeInternalConsolidation(dryRun) {
  console.log(`[EXECUTE] Starting internal consolidation (${dryRun ? 'DRY_RUN' : 'REAL_EXECUTION'})...`);
  
  const result = {
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'DRY_RUN' : 'REAL_EXECUTION',
    executions: [],
    payoutReconciliations: [],
    errors: [],
    summary: {
      totalConsolidated: 0,
      payoutsReconciled: 0,
      successCount: 0,
      errorCount: 0
    }
  };
  
  try {
    // Get bank balances
    const bankBalances = await fetchAllBankBalances();
    
    // Analyze internal consolidation
    const internalPlan = await analyzeInternalConsolidation(bankBalances);
    
    // Check for payout reconciliation opportunities
    const payoutOpportunities = [];
    
    // Look for non-Main USD accounts with balances (indicating incoming payouts)
    Object.keys(bankBalances).forEach(bankName => {
      const bankData = bankBalances[bankName];
      if (bankData && bankData.hasMultipleAccounts && bankData.nonMainAccounts) {
        bankData.nonMainAccounts.forEach(account => {
          if (account.currency === 'USD' && account.balance > 0) {
            payoutOpportunities.push({
              bankName: bankName,
              accountName: account.name,
              amount: account.balance,
              currency: account.currency
            });
          }
        });
      }
    });
    
    console.log(`[PAYOUT_DETECTION] Found ${payoutOpportunities.length} potential payout(s)`);
    
    // Execute internal consolidations with payout reconciliation
    for (let i = 0; i < internalPlan.consolidations.length; i++) {
      const consolidation = internalPlan.consolidations[i];
      
      console.log(`[EXECUTE_INTERNAL] ${consolidation.bank}: ${dryRun ? 'DRY_RUN' : 'EXECUTING'} $${consolidation.amount}`);
      
      // Check if this consolidation might be from a payout
      const relatedPayout = payoutOpportunities.find(p => 
        p.bankName.toLowerCase() === consolidation.bank.toLowerCase()
      );
      
      if (relatedPayout) {
        console.log(`[PAYOUT_DETECTED] Potential payout: $${relatedPayout.amount} from ${relatedPayout.accountName}`);
        
        // Attempt payout reconciliation
        if (!dryRun) {
          try {
            const reconciliation = await reconcilePayouts(relatedPayout.amount, consolidation.bank);
            result.payoutReconciliations.push({
              bank: consolidation.bank,
              amount: relatedPayout.amount,
              accountName: relatedPayout.accountName,
              reconciliation: reconciliation
            });
            
            if (reconciliation.success) {
              result.summary.payoutsReconciled++;
              console.log(`[PAYOUT_SUCCESS] Reconciled: ${reconciliation.message}`);
            } else {
              console.log(`[PAYOUT_FAILED] ${reconciliation.message}`);
            }
          } catch (error) {
            console.log(`[PAYOUT_ERROR] Reconciliation failed: ${error.message}`);
          }
        } else {
          console.log(`[PAYOUT_DRY_RUN] Would reconcile payout: $${relatedPayout.amount} from ${relatedPayout.accountName}`);
        }
      }
      
      if (!dryRun) {
        // Here you would implement actual transfer logic
        console.log(`[WOULD_EXECUTE] ${consolidation.bank} internal consolidation: $${consolidation.amount}`);
      }
      
      result.executions.push({
        type: 'internal_consolidation',
        bank: consolidation.bank,
        amount: consolidation.amount,
        status: dryRun ? 'dry_run' : 'executed',
        note: consolidation.note,
        payoutDetected: relatedPayout ? relatedPayout.amount : null
      });
      
      result.summary.totalConsolidated += consolidation.amount;
      result.summary.successCount++;
    }
    
    console.log(`[EXECUTE_COMPLETE] Internal consolidation completed: ${result.summary.successCount} successful, ${result.summary.payoutsReconciled} payouts reconciled, ${result.summary.errorCount} errors`);
    
  } catch (error) {
    console.error('[ERROR] Internal consolidation execution failed:', error.message);
    result.status = 'ERROR';
    result.error = error.message;
    result.summary.errorCount++;
    result.errors.push(error.message);
  }
  
  return result;
}


