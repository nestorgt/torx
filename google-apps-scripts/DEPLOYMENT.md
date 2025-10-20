# Torx Google Apps Script - Deployment Guide

## Overview

The Torx Google Apps Script is now modularized for easier development and maintenance. This guide explains how to deploy code changes to Google Apps Script using the `clasp` command-line tool.

---

## Prerequisites

### 1. Install clasp

```bash
npm install -g @google/clasp
```

### 2. Login to clasp

```bash
clasp login
```

This will open a browser window for you to authenticate with your Google account.

### 3. Verify Login

```bash
clasp login --status
```

You should see: "You are logged in."

---

## Project Structure

```
google-apps-scripts/
├── src/                          # Source code (deployed to Apps Script)
│   ├── appsscript.json          # Apps Script manifest
│   ├── config.gs                # Configuration constants
│   ├── main.gs                  # Entry point & onOpen
│   ├── utils-*.gs               # Utility functions
│   ├── bank-*.gs                # Bank-specific integrations
│   ├── balances.gs              # Balance management
│   ├── consolidation.gs         # Fund consolidation
│   ├── transfers.gs             # Transfer tracking
│   ├── payments.gs              # Payment processing
│   ├── payouts.gs               # Payout reconciliation
│   ├── expenses.gs              # Expense tracking
│   ├── sync.gs                  # Synchronization logic
│   ├── notifications.gs         # Slack/WhatsApp notifications
│   ├── snapshots.gs             # Daily snapshots
│   ├── dialogs.gs               # UI dialogs
│   ├── menus.gs                 # Custom menus
│   ├── triggers.gs              # Time-based triggers
│   └── testing.gs               # Test functions
│
├── tests/                        # Unit tests (not deployed by default)
│   ├── test-framework.gs        # Testing framework
│   ├── test-utils.gs            # Utility tests
│   ├── test-reconciliation.gs   # Reconciliation tests
│   ├── test-bank-integrations.gs # Bank integration tests
│   └── run-all-tests.gs         # Test runner
│
├── .clasp.json                   # Clasp configuration
├── deploy-gas.sh                 # Deployment script
├── run-tests.sh                  # Test runner script
├── gs_torx_main.gs.backup        # Backup of original monolithic file
└── README.md                     # Documentation
```

---

## Deployment Workflow

### Quick Deployment (Recommended)

Deploy all changes with a single command:

```bash
./deploy-gas.sh
```

This script will:
1. ✅ Verify clasp is installed and you're logged in
2. ✅ Count and list all module files
3. ✅ Push code to Google Apps Script
4. ✅ Show deployment status

### Manual Deployment

If you prefer to deploy manually:

```bash
cd google-apps-scripts
clasp push --force
```

**Note**: The `--force` flag overwrites existing files in Apps Script without prompting.

---

## Verifying Deployment

### 1. Open the Script in Browser

```bash
clasp open
```

This opens the Apps Script project in your web browser.

### 2. Check Files

In the Apps Script editor, you should see all 25 module files:
- config
- main
- utils-core
- utils-sheets
- utils-dates
- utils-http
- utils-logging
- bank-revolut
- bank-mercury
- bank-airwallex
- bank-wise
- bank-nexo
- balances
- consolidation
- transfers
- payments
- payouts
- expenses
- sync
- notifications
- snapshots
- dialogs
- menus
- triggers
- testing

### 3. Test a Function

In the Apps Script editor:
1. Select a function from the dropdown (e.g., `testCompleteSystem`)
2. Click "Run"
3. Check the execution log for errors

### 4. Verify in Google Sheets

1. Open your Google Sheet
2. Check that the **Torx** menu appears in the menu bar
3. Try a menu action (e.g., **Torx > System > Check Health**)

---

## Configuration Files

### .clasp.json

```json
{
  "scriptId": "19iTh2RalnshKPz12nQXToqXJSdeceCQecP5yug2ulgcwtVLh6kAPFUra",
  "rootDir": "./src"
}
```

- **scriptId**: Your Google Apps Script project ID
- **rootDir**: Directory containing files to deploy (`./src`)

### src/appsscript.json

Defines OAuth scopes and runtime configuration:

```json
{
  "timeZone": "Europe/Madrid",
  "dependencies": {
    "enabledAdvancedServices": []
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
}
```

---

## Development Workflow

### Making Changes

1. **Edit files** in the `src/` directory locally
2. **Test locally** if possible (or use unit tests)
3. **Deploy** using `./deploy-gas.sh`
4. **Verify** in Apps Script editor and Google Sheets

### Adding New Modules

1. Create a new `.gs` file in `src/` directory:
   ```bash
   touch src/my-new-module.gs
   ```

2. Add your functions to the file:
   ```javascript
   /**
    * my-new-module.gs
    *
    * Description of module purpose
    */

   function myNewFunction() {
     // Implementation
   }
   ```

3. Deploy:
   ```bash
   ./deploy-gas.sh
   ```

### Removing Modules

1. Delete the file from `src/` directory
2. Deploy to remove it from Apps Script:
   ```bash
   ./deploy-gas.sh
   ```

---

## Rollback Procedure

If something goes wrong after deployment:

### Option 1: Restore from Backup

The original monolithic file is backed up at `gs_torx_main.gs.backup`.

1. Copy backup to a new file:
   ```bash
   cp gs_torx_main.gs.backup gs_torx_main_restore.gs
   ```

2. Manually copy-paste the content to Apps Script editor

### Option 2: Use Apps Script Version History

1. Open the Apps Script project in browser:
   ```bash
   clasp open
   ```

2. Go to **File > Version history**

3. Restore a previous version

### Option 3: Use Git

If you've committed your changes to git:

```bash
git log --oneline                 # Find the commit before your changes
git checkout <commit-hash> -- src/  # Restore src/ directory
./deploy-gas.sh                   # Redeploy
```

---

## Troubleshooting

### Error: "clasp: command not found"

**Solution**: Install clasp globally:
```bash
npm install -g @google/clasp
```

### Error: "User has not enabled the Apps Script API"

**Solution**: Enable the Apps Script API:
1. Go to https://script.google.com/home/usersettings
2. Enable "Google Apps Script API"

### Error: "Push failed"

**Solution**: Check authentication:
```bash
clasp login --status
```

If not logged in:
```bash
clasp login
```

### Files Not Appearing in Apps Script

**Solution**:
1. Check `.clasp.json` has correct `rootDir`:
   ```json
   "rootDir": "./src"
   ```

2. Ensure files are in `src/` directory:
   ```bash
   ls -la src/
   ```

3. Try force push:
   ```bash
   clasp push --force
   ```

### Wrong Script ID

**Solution**: Update `.clasp.json` with correct script ID:
1. Open your Google Sheet
2. Go to **Extensions > Apps Script**
3. Copy the script ID from the URL:
   ```
   https://script.google.com/d/YOUR_SCRIPT_ID/edit
   ```
4. Update `.clasp.json`:
   ```json
   {
     "scriptId": "YOUR_SCRIPT_ID",
     "rootDir": "./src"
   }
   ```

---

## Advanced Usage

### Viewing Logs

View execution logs from the command line:

```bash
clasp logs
```

Watch logs in real-time:

```bash
clasp logs --watch
```

### Running Functions from CLI

Execute a function remotely:

```bash
clasp run functionName
```

Example:
```bash
clasp run testCompleteSystem
```

### Creating a New Version

Create a versioned deployment:

```bash
clasp deploy -d "Version 2.0 - Modular refactor"
```

List deployments:

```bash
clasp deployments
```

---

## Best Practices

### 1. Always Test Before Deploying

Run tests locally or in a test environment before deploying to production:

```bash
./run-tests.sh
```

### 2. Use Git for Version Control

Commit changes before deploying:

```bash
git add src/
git commit -m "Add new bank integration"
./deploy-gas.sh
```

### 3. Deploy During Low-Traffic Periods

Deploy when users are unlikely to be running triggers or manual operations.

### 4. Use Dry Run Mode

For financial operations, always test with dry run mode enabled:

```javascript
var dryRun = true;  // Set to false only when ready
```

### 5. Monitor Logs After Deployment

Check logs for errors after deployment:

```bash
clasp logs --watch
```

### 6. Document Changes

Update module-level comments when making changes:

```javascript
/**
 * bank-mercury.gs
 *
 * Mercury bank integration
 *
 * Updated: 2025-01-18 - Added support for EUR transfers
 */
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Deploy code | `./deploy-gas.sh` |
| Run tests | `./run-tests.sh` |
| Open in browser | `clasp open` |
| View logs | `clasp logs` |
| Check login status | `clasp login --status` |
| Manual push | `clasp push --force` |
| Pull from Apps Script | `clasp pull` |
| Run function | `clasp run functionName` |

---

## Support

For issues or questions:

1. Check [ARCHITECTURE.md](../ARCHITECTURE.md) for system overview
2. Check [AI_CODING_PATTERNS.md](../AI_CODING_PATTERNS.md) for code patterns
3. Check [BANK_INTEGRATIONS.md](../BANK_INTEGRATIONS.md) for bank-specific details
4. Check [TESTING.md](TESTING.md) for testing guidelines

---

**Last Updated**: 2025-01-18
**clasp Version**: 2.4.2+
**Script ID**: 19iTh2RalnshKPz12nQXToqXJSdeceCQecP5yug2ulgcwtVLh6kAPFUra
