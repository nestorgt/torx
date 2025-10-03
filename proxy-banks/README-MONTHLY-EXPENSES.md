# Monthly Expenses Tracking - Project Torx

## Overview
This implementation adds monthly expense tracking for Mercury and Airwallex to the existing Google Apps Script that manages bank balances. The system captures card expenses and transfers for each month and writes them to the Google Sheet.

## New Features

### 1. Server Endpoints (server.js)
- **`/mercury/transactions?month=X&year=Y`** - Fetches Mercury transactions for a specific month
- **`/airwallex/transactions?month=X&year=Y`** - Fetches Airwallex transactions for a specific month

Both endpoints return:
```json
{
  "month": 7,
  "year": 2025,
  "cardExpenses": 1234.56,
  "transfersOut": 500.00,
  "transfersIn": 1000.00,
  "cardDetails": [...],
  "transferDetails": [...]
}
```

### 2. Google Apps Script Functions (payments.gs)

#### Core Functions
- **`updateMonthlyExpenses(month, year)`** - Updates expenses for a specific month
- **`updateCurrentMonthExpenses()`** - Updates current month expenses
- **`updateSpecificMonthExpenses(month, year)`** - Updates expenses for a specific month (with validation)

#### Fetch Functions
- **`fetchMercuryExpenses_(month, year)`** - Fetches Mercury expenses via proxy
- **`fetchAirwallexExpenses_(month, year)`** - Fetches Airwallex expenses via proxy

#### Trigger Functions
- **`createMonthlyExpensesTrigger()`** - Creates monthly trigger for expense updates
- **`createAllTriggers()`** - Creates all triggers (daily balances + monthly expenses)

## Usage

### Automatic Updates
1. **Daily Balance Updates**: Runs at 10:00 and 22:00 daily (existing functionality)
2. **Monthly Expense Updates**: Runs on the 1st of each month at 9:00

### Manual Updates
```javascript
// Update current month
updateCurrentMonthExpenses();

// Update specific month
updateSpecificMonthExpenses(7, 2025); // July 2025
updateSpecificMonthExpenses(8, 2025); // August 2025
```

### Setup Triggers
```javascript
// Create all triggers
createAllTriggers();

// Or create individually
createTriggers_10_22_daily();      // Daily balance updates
createMonthlyExpensesTrigger();    // Monthly expense updates
```

## Google Sheet Layout

### Project Torx Tab - Payouts
- **Column H**: Monthly expenses (starting from row 8)
- **H8**: July 2025 expenses
- **H9**: August 2025 expenses
- **H10**: September 2025 expenses
- And so on...

### Cell Notes Format
Each cell contains a note with detailed breakdown:
```
Mercury: Cards $1234.56, Transfers out $500.00, Transfers in $1000.00 | Airwallex: Cards $567.89, Transfers out $200.00
```

## Data Structure

### Card Expenses
- **Total**: Sum of all card expenses from both banks
- **Details**: Per-card breakdown with amounts and descriptions
- **Filtering**: Identified by transaction type, category, or description containing "card"

### Transfers
- **Transfers Out**: Money leaving the accounts
- **Transfers In**: Money entering the accounts
- **Filtering**: Identified by transaction type, category, or description containing "transfer"

## Error Handling

### Server Errors
- API failures are logged and returned as error responses
- Individual account failures don't stop the entire process
- Graceful degradation with detailed error messages

### Apps Script Errors
- Bank-specific errors are logged and noted in the sheet
- Total calculation continues even if one bank fails
- Error details are preserved in cell notes

## Testing

### Test Script
Use `test-transactions.js` to verify endpoints:
```bash
# Set your proxy token
export PROXY_TOKEN="your-token-here"

# Run tests
node test-transactions.js
```

### Manual Testing
1. Test individual endpoints with curl or Postman
2. Run Apps Script functions manually in the editor
3. Verify data appears in the Google Sheet

## Configuration

### Required Environment Variables
- `MERCURY_API_TOKEN` - Mercury API authentication
- `AIRWALLEX_CLIENT_ID` - Airwallex client ID
- `AIRWALLEX_CLIENT_SECRET` - Airwallex client secret
- `PROXY_TOKEN` - Authentication token for proxy endpoints

### Google Apps Script Properties
- `PROXY_URL` - URL of your proxy server
- `PROXY_TOKEN` - Same token as server environment

## Security Notes

- All endpoints require proxy authentication
- API tokens are stored securely in environment variables
- No sensitive data is logged in plain text
- HTTPS validation is enforced for external API calls

## Troubleshooting

### Common Issues
1. **Authentication Errors**: Check API tokens and proxy authentication
2. **Rate Limiting**: APIs may have rate limits; implement delays if needed
3. **Data Format Changes**: API responses may change; update parsing logic
4. **Network Issues**: Check proxy server connectivity and firewall settings

### Keep the server always running (macOS LaunchAgent)

Use a LaunchAgent so `server.js` auto-starts at login and restarts if it dies.

1) Create the agent file:
```bash
cat > ~/Library/LaunchAgents/org.waresoul.proxy-banks.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>org.waresoul.proxy-banks</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>server.js</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/wsou/Developer/proxy-banks</string>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/Users/wsou/Developer/proxy-banks/server_stdout.log</string>
  <key>StandardErrorPath</key><string>/Users/wsou/Developer/proxy-banks/server_stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>8081</string>
  </dict>
</dict></plist>
PLIST
```

2) Load and start it:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/org.waresoul.proxy-banks.plist 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.waresoul.proxy-banks.plist
launchctl enable gui/$(id -u)/org.waresoul.proxy-banks
launchctl kickstart -k gui/$(id -u)/org.waresoul.proxy-banks
```

3) Verify and health check:
```bash
launchctl list | grep org.waresoul.proxy-banks
curl -sS http://localhost:8081/healthz
```

Optional: extra watchdog using the existing `check_server.sh` every minute via another LaunchAgent.

### Sheet error notes and server-down detection

- The Apps Script performs a proxy health check before running and writes a concise note “SERVER DOWN (proxy)” if unreachable.
- On successful `updateAllBalances`, previous error notes are cleared automatically.

### Debug Mode
Enable Airwallex debug logging:
```javascript
// In Google Apps Script properties
AIRWALLEX_DEBUG = true
```

## Future Enhancements

- Add support for more banks (Wise, Revolut, etc.)
- Implement expense categorization
- Add monthly expense summaries and trends
- Export functionality for accounting systems
- Real-time expense notifications
