#!/usr/bin/env python3
"""
Split gs_torx_main.gs into logical modules
"""

import re
import os

# Module categories and their matching patterns
MODULES = {
    'config.gs': {
        'description': 'Configuration constants and cell mappings',
        'patterns': [r'^var (SHEET_NAME|USERS_SHEET|MIN_BALANCE|TOPUP_AMOUNT|TS_CELL|CURRENT_TIMEZONE|USERS_FIRST_MONTH|CELLS)\s*='],
        'content': []
    },
    'utils-core.gs': {
        'description': 'Core utilities (date, props, bool, sheet)',
        'patterns': [r'^function (nowStamp|toBool|props_|getProp_|setProp_|sheet_|isWeekend|dbg_|formatCurrency|padStart)\('],
        'content': []
    },
    'utils-sheets.gs': {
        'description': 'Sheet manipulation utilities',
        'patterns': [r'^function (setCellKeepFmt_|setNoteOnly_|a1_|fmt2dec_|clearNote_|safeErrorNote_|appendNoteTop_|setCellWithNote_)\('],
        'content': []
    },
    'utils-dates.gs': {
        'description': 'Date and month utilities',
        'patterns': [r'^function (mmYYYY_|normMonthStr_|validateMonthString|getMonthDisplayName|findExistingMonthRow_|ensureMonthRow_)\('],
        'content': []
    },
    'utils-http.gs': {
        'description': 'HTTP proxy and API utilities',
        'patterns': [r'^function (proxyIsUp_|httpProxyJson_|httpProxyPostJson_|getJsonProp_|setJsonProp_)\('],
        'content': []
    },
    'utils-logging.gs': {
        'description': 'Logging and audit utilities',
        'patterns': [r'^function (logPaymentOperation|parseNumber)\('],
        'content': []
    },
    'bank-revolut.gs': {
        'description': 'Revolut bank integration',
        'patterns': [r'^function (fetchRevolutSummary_|getRevolutMainBalance_|getRevolutAccounts_|getRevolutAccountBalance_|revolutTransferBetweenAccounts_|getRevolutTransactions_|fetchRevolutExpenses_|getRevolutToNestorTransfers_|consolidateRevolutUsdFunds_|revolutFxUsdToEur_|revolutMove_)\('],
        'content': []
    },
    'bank-mercury.gs': {
        'description': 'Mercury bank integration',
        'patterns': [r'^function (fetchMercurySummary_|fetchMercuryMainBalance_|getMercuryAccounts_|getMercuryAccountBalance_|mercuryTransferToMain_|fetchMercuryExpenses_|consolidateMercuryUsdFunds_|processMercuryTransactionsForPayouts_)\('],
        'content': []
    },
    'bank-airwallex.gs': {
        'description': 'Airwallex bank integration',
        'patterns': [r'^function (fetchAirwallexSummary_|fetchAirwallexExpenses_|testAirwallexExpenseCalculation)\('],
        'content': []
    },
    'bank-wise.gs': {
        'description': 'Wise bank integration',
        'patterns': [r'^function fetchWiseSummary_\('],
        'content': []
    },
    'bank-nexo.gs': {
        'description': 'Nexo bank integration',
        'patterns': [r'^function fetchNexoSummary_\('],
        'content': []
    },
    'balances.gs': {
        'description': 'Balance management and updates',
        'patterns': [r'^function (updateBankBalance_|updateAllBalances|updateBankBalances_|checkBankMinimumBalance_|checkAllBankMinimumBalances|dryRunCheckAllBankMinimumBalances|transferFromRevolut_|fetchAllBankUsdBalances_|updateBalancesAfterInternalConsolidation_|getFinalMainAccountBalances_|adjustBalancesForPendingTransfers_)\('],
        'content': []
    },
    'consolidation.gs': {
        'description': 'Fund consolidation logic',
        'patterns': [r'^function (intelligentConsolidationSystem_|performInternalConsolidation_|performCrossBankTopup_|consolidateUsdFundsToMain_|consolidateFundsToMain_)\('],
        'content': []
    },
    'transfers.gs': {
        'description': 'Transfer tracking and reconciliation',
        'patterns': [r'^function (markTransferAsReceived_|autoDetectCompletedTransfers_|reconcileTransferWithSpreadsheet|detectAndReconcilePayouts_|loadProcessedPayoutTransactions_|saveProcessedPayoutTransactions_|getTransfersByBank_)\('],
        'content': []
    },
    'payments.gs': {
        'description': 'User payment processing',
        'patterns': [r'^function (sendPaymentNotification_|checkPaymentPrerequisites|dryRunPayUsersForCurrentMonth|payUsersForCurrentMonth|dryRunPayUsersForPreviousMonth|payUsersForPreviousMonth|dryRunPayUsersForMonth|payUsersForMonth|menuDryRunSpecificMonth|menuPaySpecificMonth)\('],
        'content': []
    },
    'payouts.gs': {
        'description': 'Payout detection and reconciliation',
        'patterns': [r'^function (calculateExpectedPayoutAmount_|listPendingPayouts|formatPendingPayoutsList)\('],
        'content': []
    },
    'expenses.gs': {
        'description': 'Expense tracking and calculation',
        'patterns': [r'^function (calculateMonthlyExpensesTotal|calculateCurrentMonthExpensesToDate|calculateMultipleMonthsExpenses|buildMonthlyExpensesNotes_|formatMonthlyExpensesNote_|updateMonthlyExpenses|updateCurrentMonthExpenses|updateSpecificMonthExpenses|testMonthlyExpenses|calculateMonthlyExpenses_)\('],
        'content': []
    },
    'sync.gs': {
        'description': 'Synchronization orchestration',
        'patterns': [r'^function (syncBanksData|testSyncBalancesOnly|testSyncPayoutsOnly|testSyncConsolidationOnly|testSyncExpensesOnly|testSyncDryRun|testSyncFull)\('],
        'content': []
    },
    'notifications.gs': {
        'description': 'Slack and WhatsApp notifications',
        'patterns': [r'^function (sendSlackMessageWebhook|sendSlackMessageToken|sendDailySummaryToSlack|generateDailyWeeklySummary|generateSlackSummaryMessage|sendPaymentsReceivedNotification|getSlackWebhookUrl)\('],
        'content': []
    },
    'snapshots.gs': {
        'description': 'Daily snapshot management',
        'patterns': [r'^function (saveDailySnapshot|loadPreviousDaySnapshot|loadSnapshotForDate|createEmptyMetrics|cloneMetrics|sanitizeMetrics|addMetrics|subtractMetrics|formatValue|clearAllSnapshotData|formatDifferenceLine|formatAccumulatedLine)\('],
        'content': []
    },
    'dialogs.gs': {
        'description': 'UI dialogs and user interaction',
        'patterns': [r'^function (displayBalanceDialog|displayIndividualBanksDialog|displaySummaryDialog|displaySummaryResult|displayErrorDialog|displayError|showMultiLineDialog)\('],
        'content': []
    },
    'menus.gs': {
        'description': 'Custom menu functions',
        'patterns': [r'^function (menu[A-Z]|runMenuHandler|checkIndividualBankBalances|generateBalanceSummaryForSheet|processFundedAccounts)\('],
        'content': []
    },
    'triggers.gs': {
        'description': 'Time-based triggers and automation',
        'patterns': [r'^function TRIGGER_\w+\('],
        'content': []
    },
    'testing.gs': {
        'description': 'Test functions',
        'patterns': [r'^function (test[A-Z]|simpleTest|debugMenuFunctions|firstTimeSetup)\('],
        'content': []
    },
    'main.gs': {
        'description': 'Entry point and onOpen',
        'patterns': [r'^function (onOpen|setProxyToken|getCurrentMonthStatus|checkUSDBalanceThreshold)\('],
        'content': []
    }
}

def read_file(filename):
    """Read the entire file"""
    with open(filename, 'r', encoding='utf-8') as f:
        return f.readlines()

def extract_function_with_body(lines, start_idx):
    """Extract a complete function including its body"""
    result = []
    brace_count = 0
    in_function = False

    for i in range(start_idx, len(lines)):
        line = lines[i]
        result.append(line)

        # Count braces
        brace_count += line.count('{')
        brace_count -= line.count('}')

        if '{' in line:
            in_function = True

        # Function complete when braces balanced
        if in_function and brace_count == 0:
            return result, i + 1

    return result, len(lines)

def main():
    input_file = 'gs_torx_main.gs'
    output_dir = 'src'

    print(f"Reading {input_file}...")
    lines = read_file(input_file)

    # Track which lines have been assigned
    assigned_lines = set()

    # Pass 1: Assign functions to modules
    i = 0
    while i < len(lines):
        line = lines[i]

        # Check if this line matches any module pattern
        matched = False
        for module_name, module_info in MODULES.items():
            for pattern in module_info['patterns']:
                if re.search(pattern, line):
                    # Extract the complete function
                    if line.strip().startswith('function '):
                        func_lines, next_i = extract_function_with_body(lines, i)
                        module_info['content'].extend(func_lines)
                        module_info['content'].append('\n')  # Add spacing
                        for idx in range(i, next_i):
                            assigned_lines.add(idx)
                        i = next_i - 1
                        matched = True
                        break
                    elif line.strip().startswith('var '):
                        # For variables, just take the line
                        module_info['content'].append(line)
                        assigned_lines.add(i)
                        matched = True
                        break
            if matched:
                break

        i += 1

    # Pass 2: Collect header and unmatched content
    header = []
    unmatched = []
    in_header = True

    for i, line in enumerate(lines):
        if i in assigned_lines:
            in_header = False
            continue

        # Header is everything before first function
        if in_header and not line.strip().startswith('function '):
            if line.strip() and not line.strip().startswith('/*') and not line.strip().startswith('*'):
                header.append(line)
        elif not in_header and i not in assigned_lines:
            # Unmatched content
            if line.strip():
                unmatched.append((i + 1, line))

    # Write modules
    os.makedirs(output_dir, exist_ok=True)

    for module_name, module_info in MODULES.items():
        if module_info['content']:
            filepath = os.path.join(output_dir, module_name)
            print(f"Writing {filepath}... ({len(module_info['content'])} lines)")

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(f"/**\n * {module_name}\n *\n * {module_info['description']}\n */\n\n")
                f.writelines(module_info['content'])

    # Report unmatched functions
    if unmatched:
        print("\n⚠️  Unmatched content (needs manual review):")
        for line_num, line in unmatched[:20]:
            print(f"  Line {line_num}: {line.strip()[:80]}")
        if len(unmatched) > 20:
            print(f"  ... and {len(unmatched) - 20} more lines")

    print(f"\n✅ Split complete! Modules created in {output_dir}/")
    print(f"   Total lines: {len(lines)}")
    print(f"   Assigned: {len(assigned_lines)}")
    print(f"   Unassigned: {len(lines) - len(assigned_lines)}")

if __name__ == '__main__':
    main()
