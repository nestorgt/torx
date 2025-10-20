/**
 * utils-http.gs
 *
 * HTTP proxy and API utilities
 */

function proxyIsUp_() {
  Logger.log('[PROXY_HEALTH] Checking proxy health...');
  
  try {
    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');
    
    if (!proxyUrl || !proxyToken) {
 Logger.log('[PROXY_HEALTH] ❌ Proxy configuration missing');
      return false;
    }
    
    var maxRetries = 3;
    var retryDelay = 2000; // 2 seconds
    
    for (var attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        Logger.log('[PROXY_HEALTH] Attempt %s/%s - Testing proxy connectivity...', attempt, maxRetries);
        
        var startTime = new Date().getTime();
        var response = UrlFetchApp.fetch(proxyUrl + '/health', {
          method: 'GET',
          headers: { 'x-proxy-token': proxyToken },
          muteHttpExceptions: true,
          followRedirects: false,
          validateHttpsCertificates: true,
          timeout: 10000 // 10 seconds timeout
        });
        
        var responseTime = new Date().getTime() - startTime;
        var statusCode = response.getResponseCode();
        var responseText = response.getContentText();
        
        Logger.log('[PROXY_HEALTH] Response: Status=%s, Time=%sms', statusCode, responseTime);
        
        if (statusCode >= 200 && statusCode < 300) {
          Logger.log('[PROXY_HEALTH] ✅ Proxy is healthy (attempt %s/%s)', attempt, maxRetries);
          return true;
        }
        
        Logger.log('[PROXY_HEALTH] ⚠️ Attempt %s/%s failed: Status=%s', attempt, maxRetries, statusCode);
        
        if (attempt < maxRetries) {
          Logger.log('[PROXY_HEALTH] Waiting %sms before retry...', retryDelay);
          Utilities.sleep(retryDelay);
          retryDelay *= 1.5; // Exponential backoff
        }
        
      } catch (e) {
        Logger.log('[PROXY_HEALTH] ⚠️ Attempt %s/%s error: %s', attempt, maxRetries, e.message);
        
        if (attempt < maxRetries) {
          Utilities.sleep(retryDelay);
          retryDelay *= 1.5;
        }
      }
    }
    
    Logger.log('[PROXY_HEALTH] ❌ Proxy health check failed after %s attempts', maxRetries);
    return false;
    
  } catch (e) {
    Logger.log('[PROXY_HEALTH] ❌ Proxy health check error: %s', e.message);
    return false;
  }
}

function httpProxyJson_(path) {
  Logger.log('[HTTP_PROXY] Making request to: %s', path);

  try {
    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');

    if (!proxyUrl || !proxyToken) {
      throw new Error('Proxy configuration missing - check PROXY_URL and PROXY_TOKEN properties');
    }

    var fullUrl = proxyUrl + path;
    Logger.log('[HTTP_PROXY] Full URL: %s', fullUrl);

    var response = UrlFetchApp.fetch(fullUrl, {
      method: 'GET',
      headers: {
        'x-proxy-token': proxyToken,
        'Accept': 'application/json',
        'User-Agent': 'GoogleAppsScript-Torx/1.0'
      },
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true,
      timeout: 15000
    });

    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('[HTTP_PROXY] Response: Status=%s, BodyLength=%s', statusCode, responseText.length);
    
    if (statusCode >= 400) {
      // Truncate HTML error responses to avoid log noise
      var truncatedResponse = responseText;
      if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
        truncatedResponse = 'HTML Error Page (truncated)';
      } else if (responseText.length > 200) {
        truncatedResponse = responseText.substring(0, 200) + '...';
      }
      Logger.log('[HTTP_PROXY] ❌ Error Response: %s', truncatedResponse);
      throw new Error('HTTP ' + statusCode + ' ' + path + ' -> ' + truncatedResponse);
    }
    
    if (statusCode >= 200 && statusCode < 300) {
      try {
        var jsonData = JSON.parse(responseText);
        Logger.log('[HTTP_PROXY] ✅ Successfully parsed JSON response');
        return jsonData;
      } catch (parseError) {
        Logger.log('[HTTP_PROXY] ❌ JSON Parse Error: %s', parseError.message);
        Logger.log('[HTTP_PROXY] Raw response: %s', responseText);
        throw new Error('Invalid JSON response: ' + parseError.message);
      }
    }
    
    Logger.log('[HTTP_PROXY] ⚠️ Unexpected status code: %s', statusCode);
    throw new Error('Unexpected response status: ' + statusCode);
    
  } catch (e) {
    Logger.log('[HTTP_PROXY] ❌ Request failed: %s', e.message);
    throw e;
  }
}

function httpProxyPostJson_(path, body) {
  Logger.log('[HTTP_POST] Making POST request to: %s', path);
  
  try {
    var props = props_();
    var proxyUrl = props.getProperty('PROXY_URL');
    var proxyToken = props.getProperty('PROXY_TOKEN');
    
    if (!proxyUrl || !proxyToken) {
      throw new Error('Proxy configuration missing - check PROXY_URL and PROXY_TOKEN properties');
    }
    
    var fullUrl = proxyUrl + path;
    var jsonPayload = JSON.stringify(body);
    
    Logger.log('[HTTP_POST] Full URL: %s', fullUrl);
    Logger.log('[HTTP_POST] Payload: %s', jsonPayload.substring(0, 200) + (jsonPayload.length > 200 ? '...' : ''));
    
    var response = UrlFetchApp.fetch(fullUrl, {
      method: 'POST',
      headers: {
        'x-proxy-token': proxyToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'GoogleAppsScript-Torx/1.0'
      },
      payload: jsonPayload,
      muteHttpExceptions: true,
      followRedirects: false,
      validateHttpsCertificates: true,
      timeout: 30000
    });
    
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('[HTTP_POST] Response: Status=%s, BodyLength=%s', statusCode, responseText.length);
    
    if (statusCode >= 400) {
      // Truncate HTML error responses to avoid log noise
      var truncatedResponse = responseText;
      if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
        truncatedResponse = 'HTML Error Page (truncated)';
      } else if (responseText.length > 200) {
        truncatedResponse = responseText.substring(0, 200) + '...';
      }
      Logger.log('[HTTP_POST] ❌ Error Response: %s', truncatedResponse);
      throw new Error('HTTP ' + statusCode + ' ' + path + ' -> ' + truncatedResponse);
    }
    
    if (statusCode >= 200 && statusCode < 300) {
      try {
        var jsonData = JSON.parse(responseText);
        Logger.log('[HTTP_POST] ✅ Successfully parsed JSON response');
        return jsonData;
      } catch (parseError) {
        Logger.log('[HTTP_POST] ❌ JSON Parse Error: %s', parseError.message);
        Logger.log('[HTTP_POST] Raw response: %s', responseText);
        throw new Error('Invalid JSON response: ' + parseError.message);
      }
    }
    
    Logger.log('[HTTP_POST] ⚠️ Unexpected status code: %s', statusCode);
    throw new Error('Unexpected response status: ' + statusCode);
    
  } catch (e) {
    Logger.log('[HTTP_POST] ❌ POST request failed: %s', e.message);
    throw e;
  }
}

function getJsonProp_(key) {
  try {
    var val = props_().getProperty(key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    Logger.log('[ERROR] getJsonProp_ failed for %s: %s', key, e.message);
    return null;
  }
}

function setJsonProp_(key, obj) {
  try {
    props_().setProperty(key, JSON.stringify(obj));
  } catch (e) {
    Logger.log('[ERROR] setJsonProp_ failed for %s: %s', key, e.message);
  }
}

