# Proxy Banks

A Node.js proxy server for integrating with multiple banking and financial APIs including Revolut, Mercury, Airwallex, Wise, and Nexo.

## Features

- **Multi-Bank Integration**: Supports Revolut, Mercury, Airwallex, Wise, and Nexo APIs
- **Secure Authentication**: OAuth2 flows, API keys, and mTLS certificate support
- **Transaction Management**: Fetch balances, transactions, and account data
- **Real-time Monitoring**: Health checks and automated server management
- **Google Sheets Integration**: Export data to Google Sheets
- **Notification System**: WhatsApp, Email, and Telegram notifications

## Security

This project uses a `.secrets/` directory to store all sensitive files:
- Environment variables (`.env`)
- SSL certificates (`.pem` files)
- API tokens (`tokens.json`)
- Session cookies (`nexo.cookies.json`)

**All sensitive files are automatically excluded from Git via `.gitignore`**

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd proxy-banks
npm install
```

### 2. Setup Environment

```bash
# Copy the template and fill in your values
cp .env.example .secrets/.env

# Edit the configuration
nano .secrets/.env
```

### 3. Configure Certificates

```bash
# Create certificates directory
mkdir -p .secrets/certs

# Add your SSL certificates
# - client.cert.pem (for Revolut mTLS)
# - client.key.pem (for Revolut mTLS)
```

### 4. Start the Server

```bash
# Start the server
npm start

# Or use the health check script
./check_server.sh
```

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PROXY_TOKEN` | Authentication token for proxy endpoints | `your_proxy_token` |
| `CLIENT_CERT_PATH` | Path to client certificate | `/path/to/client.cert.pem` |
| `CLIENT_KEY_PATH` | Path to client private key | `/path/to/client.key.pem` |

### Bank-Specific Configuration

#### Revolut
- `CLIENT_ID`: OAuth2 client ID
- `REDIRECT_URI`: OAuth2 redirect URI
- `ISSUER`: JWT issuer

#### Mercury
- `MERCURY_API_TOKEN`: API authentication token

#### Airwallex
- `AIRWALLEX_CLIENT_ID`: API client ID
- `AIRWALLEX_CLIENT_SECRET`: API client secret

#### Wise
- `WISE_API_TOKEN`: API authentication token
- `WISE_PROFILE_ID`: Profile identifier

#### Nexo
- `NEXO_EMAIL`: Account email
- `NEXO_PASSWORD`: Account password
- `NEXO_TOTP_SECRET`: TOTP secret for 2FA

## API Endpoints

### Health Check
```
GET /healthz
```

### Revolut
```
GET /revolut/summary
GET /revolut/accounts
GET /revolut/transactions?month=9&year=2025
POST /revolut/transfer
POST /revolut/exchange
```

### Mercury
```
GET /mercury/summary
GET /mercury/transactions?month=9&year=2025
```

### Airwallex
```
GET /airwallex/summary
GET /airwallex/transactions?month=9&year=2025
```

### Wise
```
GET /wise/summary
```

### Nexo
```
GET /nexo/summary
```

## Authentication

All API endpoints require the `x-proxy-token` header:

```bash
curl -H "x-proxy-token: your_proxy_token" \
     http://localhost:8081/revolut/summary
```

## Monitoring

The server includes automated health checks and monitoring:

```bash
# Check server health
./check_server.sh

# Monitor logs
tail -f server.log
```

## Development

### Project Structure

```
proxy-banks/
├── .secrets/           # Sensitive files (git-ignored)
│   ├── .env           # Environment variables
│   ├── certs/         # SSL certificates
│   ├── tokens.json    # OAuth tokens
│   └── nexo.cookies.json
├── server.js          # Main server file
├── .env.example       # Environment template
├── .gitignore         # Git ignore rules
├── package.json       # Dependencies
└── README.md          # This file
```

### Adding New Banks

1. Add environment variables to `.env.example`
2. Implement authentication function
3. Add API endpoints in `server.js`
4. Update this README

## Troubleshooting

### Common Issues

1. **403 Forbidden**: Check IP whitelisting with bank APIs
2. **Certificate Errors**: Verify SSL certificate paths and permissions
3. **Authentication Failures**: Check API credentials and tokens

### Logs

```bash
# Server logs
tail -f server.log

# Health check logs
tail -f server_check.log

# Monitor logs
tail -f monitor_stdout.log
```

## License

[Add your license here]

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions, please [create an issue](link-to-issues) or contact the maintainers.