# Torx

A comprehensive suite of financial automation tools and utilities for personal and business financial management.

## 🏗️ Project Structure

This repository contains three main projects that work together to provide a complete financial automation solution:

```
torx/
├── mac-app/              # macOS menu bar application
├── proxy-banks/          # Banking API proxy server
├── google-apps-scripts/  # Google Sheets automation scripts
└── README.md            # This file
```

## 📱 Mac App (`mac-app/`)

A macOS menu bar application that monitors your public IP address and enforces workflow automation.

### Features
- **IP Monitoring**: Real-time public IP tracking with visual status indicators
- **Workflow Enforcement**: Automatically closes Chrome when IP matches target (185.87.45.245)
- **Reactive Updates**: Uses Apple's native frameworks for network change detection
- **Auto-Update**: GitHub releases integration with automatic updates
- **Wallpaper Control**: Optional wallpaper color management

### Status Indicators
- **White**: Monitoring OFF
- **Orange**: Monitoring ON + IP matches target
- **Blue**: Monitoring ON + IP different from target

### Quick Start
```bash
cd mac-app
./build_root_app.sh
open ./Torx.app
```

## 🏦 Proxy Banks (`proxy-banks/`)

A Node.js proxy server that integrates with multiple banking and financial APIs, providing a unified interface for financial data access.

### Supported Banks
- **Revolut**: OAuth2 + mTLS authentication
- **Mercury**: API token authentication
- **Airwallex**: Client credentials authentication
- **Wise**: API token authentication
- **Nexo**: Email/password + TOTP authentication

### Features
- **Multi-Bank Integration**: Unified API for all supported banks
- **Secure Authentication**: OAuth2, API keys, and mTLS certificates
- **Transaction Management**: Fetch balances, transactions, and account data
- **Real-time Monitoring**: Health checks and automated server management
- **Notification System**: WhatsApp, Email, and Telegram integration

### Quick Start
```bash
cd proxy-banks
npm install
cp .env.example .secrets/.env
# Edit .secrets/.env with your credentials
npm start
```

### API Endpoints
- `GET /healthz` - Health check
- `GET /revolut/summary` - Revolut account summary
- `GET /mercury/transactions?month=9&year=2025` - Mercury transactions
- `POST /revolut/transfer` - Create Revolut transfer
- And many more...

## 📊 Google Apps Scripts (`google-apps-scripts/`)

Google Apps Script automation for financial data management and automated payments.

### Scripts

#### `gs_banks.gs` - Balance Updates & Monthly Expenses
- **Daily Balance Updates**: Automatically updates bank balances in Google Sheets
- **Monthly Expense Tracking**: Captures card and transfer expenses
- **Multi-Bank Support**: Mercury, Airwallex, Revolut, Wise, Nexo
- **Health Monitoring**: Robust proxy health checks with retries

#### `gs_payments.gs` - Automated Payment System
- **Automated Monthly Payments**: Processes user payments through Revolut
- **FX Conversion**: USD→EUR conversion with weekend restrictions
- **Dry Run Mode**: Test payments without actual transfers
- **Audit Trail**: Comprehensive logging and payment history
- **WhatsApp Notifications**: Payment confirmations via WhatsApp

### Features
- **Idempotent Operations**: Handles duplicate requests gracefully
- **Balance Validation**: Checks balances before processing payments
- **User Management**: Active/inactive user status tracking
- **Month Management**: Auto-creates new month rows as needed

## 🔧 Setup and Installation

### Prerequisites
- **macOS**: For the Mac app (macOS 12.0+)
- **Node.js**: For the proxy server (Node.js 18+)
- **Google Account**: For Google Apps Scripts
- **Bank Accounts**: With supported financial institutions

### 1. Clone the Repository
```bash
git clone git@github.com:nestorgt/torx.git
cd torx
```

### 2. Setup Mac App
```bash
cd mac-app
open torx-mac.xcodeproj
# Build and run in Xcode, or use:
./build_root_app.sh
```

### 3. Setup Proxy Server
```bash
cd proxy-banks
npm install
cp .env.example .secrets/.env
# Configure your bank credentials in .secrets/.env
npm start
```

### 4. Setup Google Apps Scripts
1. Create a new Google Apps Script project
2. Copy the contents of `gs_banks.gs` and `gs_payments.gs`
3. Configure Script Properties:
   - `PROXY_URL`: Your proxy server URL
   - `PROXY_TOKEN`: Authentication token
   - Bank-specific credentials

## 🔐 Security

### Sensitive Data Protection
- **`.secrets/` directory**: Contains all sensitive files (git-ignored)
- **Environment variables**: All credentials stored in `.env` files
- **No hardcoded secrets**: All sensitive data referenced via environment variables
- **Certificate management**: SSL certificates stored securely

### Authentication
- **Proxy Token**: Required for all API endpoints
- **Bank APIs**: Individual authentication per bank
- **OAuth2**: For Revolut integration
- **mTLS**: Client certificates for Revolut API

## 📈 Monitoring and Maintenance

### Health Checks
- **Proxy Server**: Automated health monitoring every 2 minutes
- **API Connectivity**: Regular verification of bank API access
- **Error Handling**: Comprehensive error logging and recovery

### Logs
- **Server Logs**: `proxy-banks/server.log`
- **Health Check Logs**: `proxy-banks/server_check.log`
- **Monitor Logs**: `proxy-banks/monitor_stdout.log`

### Automated Monitoring
```bash
# Check server health
cd proxy-banks
./check_server.sh

# Enhanced monitoring
./enhanced_monitor.sh

# Status check
./status_check.sh
```

## 🚀 Development

### Project Rules
Each project has specific development guidelines:
- **mac-app/RULES.md**: macOS app development rules
- **proxy-banks/RULES.md**: Server development and security rules

### Key Principles
- **Security First**: Never commit sensitive data
- **Reliability**: Comprehensive error handling and monitoring
- **Consistency**: Follow existing code patterns
- **Testing**: Thorough testing before deployment

## 📚 Documentation

### Project-Specific Documentation
- **mac-app/README.md**: Detailed macOS app documentation
- **proxy-banks/README.md**: Comprehensive server documentation
- **proxy-banks/README-MONTHLY-EXPENSES.md**: Monthly expense tracking guide

### API Documentation
- **Proxy Server**: RESTful API with comprehensive endpoints
- **Google Apps Scripts**: Function documentation in code comments
- **Mac App**: Menu-driven interface with status indicators

## 🔄 Workflow Integration

### Typical Workflow
1. **Mac App**: Monitors IP and enforces workflow rules
2. **Proxy Server**: Provides unified banking API access
3. **Google Scripts**: Automates financial data management and payments
4. **Monitoring**: Continuous health checks and error recovery

### Data Flow
```
Bank APIs → Proxy Server → Google Sheets → Automated Actions
     ↓              ↓           ↓              ↓
  Real-time    Unified API   Data Storage   Payments &
  Updates      Access        & Analysis     Notifications
```

## 🛠️ Troubleshooting

### Common Issues
1. **Proxy Server Not Starting**: Check certificate paths and environment variables
2. **Bank API Errors**: Verify credentials and IP whitelisting
3. **Mac App Not Responding**: Check network permissions and automation settings
4. **Google Scripts Failing**: Verify Script Properties and proxy connectivity

### Support
- Check individual project README files for detailed troubleshooting
- Review log files for specific error messages
- Ensure all prerequisites are properly configured

## 📄 License

[Add your license information here]

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow project-specific rules and guidelines
4. Test thoroughly before submitting
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue in the GitHub repository
- Check project-specific documentation
- Review troubleshooting guides

---

**Last Updated**: October 2025  
**Version**: 1.0  
**Maintainer**: Nestor GT
