# Google Apps Scripts

Google Apps Script automation scripts for financial data management and automated payments in the Torx project.

## 📋 Scripts Overview

### `gs_banks.gs` - Balance Updates & Monthly Expenses
Automates daily balance updates and monthly expense tracking across multiple banks.

#### Features
- **Daily Balance Updates**: Updates bank balances in Google Sheets twice daily
- **Monthly Expense Tracking**: Captures card and transfer expenses monthly
- **Multi-Bank Support**: Integrates with Mercury, Airwallex, Revolut, Wise, and Nexo
- **Health Monitoring**: Robust proxy health checks with automatic retries
- **Error Handling**: Comprehensive error handling and logging

#### Supported Banks
- **Mercury**: USD (D2), EUR (D3) balances
- **Airwallex**: USD (C2), EUR (C3) balances
- **Revolut**: USD (E2), EUR (E3) balances
- **Wise**: USD (F2), EUR (F3) balances
- **Nexo**: USD (G2) balance only

#### Monthly Expense Tracking
- Captures expenses from cards and transfers
- Writes to "Project Torx" tab, column H, starting row 8
- Supports monthly data from July 2025 onwards
- Includes detailed notes and categorization

### `gs_payments.gs` - Automated Payment System
Automates monthly payments to users through Revolut with comprehensive management features.

#### Features
- **Automated Monthly Payments**: Processes user payments through Revolut
- **FX Conversion**: USD→EUR conversion with weekend restrictions
- **Dry Run Mode**: Test payments without actual transfers
- **Idempotent Operations**: Handles duplicate requests gracefully
- **Audit Trail**: Comprehensive logging and payment history
- **WhatsApp Notifications**: Payment confirmations via WhatsApp
- **Balance Validation**: Checks balances before processing payments

#### Sheet Structure
- **Row 1**: User names (column headers)
- **Row 28**: User active status (TRUE/FALSE)
- **Row 29**: Monthly payment amounts
- **Row 30+**: Monthly payment records (one row per month)

#### Menu Functions
- **Pay Current Month (💰)**: Process payments for current month
- **Dry Run Current Month (🧪)**: Test payments without execution
- **Month-specific payments**: Direct payment for specific months
- **Check Status (🔍)**: Current month payment status
- **Validate Sheet (📊)**: Sheet structure validation
- **Test System (🧪)**: System health check

## 🔧 Setup and Configuration

### Prerequisites
- Google Account with Google Sheets access
- Proxy server running and accessible
- Bank accounts with supported institutions
- Google Apps Script project created

### Required Script Properties
Configure these in Google Apps Script:

#### Core Properties
- `PROXY_URL`: Your proxy server URL (e.g., `https://proxy.yourdomain.com`)
- `PROXY_TOKEN`: Authentication token for proxy server

#### Bank-Specific Properties
- `AIRWALLEX_CLIENT_ID`: Airwallex API client ID
- `AIRWALLEX_CLIENT_SECRET`: Airwallex API client secret
- `AIRWALLEX_BASE`: Airwallex API base URL (default: `https://api.airwallex.com`)

#### Optional Properties
- `REV_FX_USD_MULT`: FX multiplier for USD→EUR conversion (default: 1.20)
- `VERBOSE_LOGS`: Enable verbose logging (0 or 1)

### Setup Steps
1. **Create Google Apps Script Project**
   - Go to [script.google.com](https://script.google.com)
   - Create new project
   - Copy contents of `gs_banks.gs` and `gs_payments.gs`

2. **Configure Script Properties**
   - Go to Project Settings → Script Properties
   - Add all required properties listed above

3. **Set Up Google Sheets**
   - Create sheets with proper structure
   - Ensure proper permissions for script access

4. **Configure Triggers**
   - Set up time-based triggers for automated execution
   - Balance updates: Every 12 hours
   - Monthly expenses: First day of each month

## 📊 Sheet Structure

### Balance Updates Sheet ("Payouts")
```
A1: Timestamp
C2: Airwallex USD Balance
C3: Airwallex EUR Balance
D2: Mercury USD Balance
D3: Mercury EUR Balance
E2: Revolut USD Balance
E3: Revolut EUR Balance
F2: Wise USD Balance
F3: Wise EUR Balance
G2: Nexo USD Balance
```

### Monthly Expenses Sheet ("Project Torx")
```
H8+: Monthly expense data
Format: YYYY-MM | Bank | Amount | Description | Notes
```

### Payments Sheet ("Users")
```
Row 1: User names (column headers)
Row 28: User active status (TRUE/FALSE)
Row 29: Monthly payment amounts
Row 30+: Monthly payment records
```

## 🔄 Automation and Triggers

### Recommended Triggers
- **Balance Updates**: Every 12 hours (6 AM and 6 PM)
- **Monthly Expenses**: First day of each month at 9 AM
- **Payment Processing**: Manual or scheduled as needed

### Trigger Setup
1. Go to Triggers in Google Apps Script
2. Create new trigger
3. Select function to run
4. Set time-based trigger
5. Configure frequency and time

## 🛠️ Functions Reference

### Balance Update Functions
- `updateAllBalances()`: Updates all bank balances
- `updateBankBalance_(bank, currency, amount)`: Updates specific bank balance
- `fetchBankData_(bank)`: Fetches data from specific bank

### Monthly Expense Functions
- `updateCurrentMonthExpenses()`: Updates current month expenses
- `updateSpecificMonthExpenses(month, year)`: Updates specific month
- `buildMonthlyExpensesNotes_(bank, month, year)`: Builds expense notes

### Payment Functions
- `payCurrentMonth()`: Process current month payments
- `dryRunCurrentMonth()`: Test current month payments
- `paySpecificMonth(month, year)`: Process specific month payments
- `checkCurrentMonthStatus()`: Check current month status

### Utility Functions
- `httpProxyJson_(path)`: Make GET request to proxy
- `httpProxyPostJson_(path, body)`: Make POST request to proxy
- `validateSheetStructure()`: Validate sheet structure
- `testSystemHealth()`: Test system health

## 🔍 Testing and Debugging

### Test Functions
- `testJuly2025()`: Test July 2025 simulation
- `testAugust2025()`: Test August 2025 simulation
- `testSeptember2025()`: Test September 2025 simulation

### Debugging
- Check Google Apps Script logs for errors
- Verify Script Properties are correctly set
- Test proxy server connectivity
- Validate sheet structure and permissions

### Common Issues
1. **Proxy Connection Failed**: Check PROXY_URL and PROXY_TOKEN
2. **Bank API Errors**: Verify bank-specific credentials
3. **Sheet Access Denied**: Check sheet permissions
4. **Trigger Not Running**: Verify trigger configuration

## 📈 Monitoring and Maintenance

### Health Checks
- Regular proxy server health monitoring
- API connectivity verification
- Sheet structure validation
- Error rate monitoring

### Logging
- All operations logged to Google Apps Script logs
- Error details captured for debugging
- Performance metrics tracked
- Audit trail maintained for payments

### Maintenance Tasks
- Regular credential rotation
- Sheet structure validation
- Trigger verification
- Error log review

## 🔐 Security Considerations

### Data Protection
- All sensitive data stored in Script Properties
- No hardcoded credentials in code
- Secure communication with proxy server
- Proper sheet access controls

### Access Control
- Limit sheet access to necessary users
- Use service accounts where possible
- Regular access review
- Monitor for unauthorized access

## 📚 Additional Resources

### Documentation
- Individual script files contain detailed function documentation
- Inline comments explain complex logic
- Error handling patterns documented

### Support
- Check Google Apps Script logs for errors
- Verify proxy server status
- Review Script Properties configuration
- Test individual functions before full automation

---

**Last Updated**: October 2025  
**Version**: 1.0  
**Maintainer**: Nestor GT
