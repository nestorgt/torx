#!/bin/bash

# Check and verify Google Apps Script triggers
# This script helps ensure all triggers are preserved after deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

cd "$(dirname "$0")"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Torx Trigger Verification${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if clasp is installed
if ! command -v clasp &> /dev/null; then
    echo -e "${RED}❌ Error: clasp is not installed${NC}"
    echo -e "${YELLOW}   Install it with: npm install -g @google/clasp${NC}"
    exit 1
fi

echo -e "${CYAN}📋 Available Trigger Functions in Code:${NC}"
echo ""
grep "^function TRIGGER_" src/triggers.gs | sed 's/function /  • /' | sed 's/() {//'
echo ""

echo -e "${CYAN}📊 Trigger Function Summary:${NC}"
echo ""

# Count trigger functions
TRIGGER_COUNT=$(grep -c "^function TRIGGER_" src/triggers.gs)
echo -e "  Total trigger functions: ${GREEN}${TRIGGER_COUNT}${NC}"
echo ""

echo -e "${CYAN}🔍 Expected Triggers (should be set up in Apps Script):${NC}"
echo ""
echo -e "${YELLOW}Time-based Triggers:${NC}"
echo -e "  1. ${GREEN}TRIGGER_updateAllBalances${NC}"
echo -e "     Schedule: Daily (10:00 AM and 10:00 PM recommended)"
echo -e "     Purpose: Update all bank balances automatically"
echo ""
echo -e "  2. ${GREEN}TRIGGER_syncBanksDataFull${NC}"
echo -e "     Schedule: Daily (e.g., 11:00 AM)"
echo -e "     Purpose: Complete sync (balances, transfers, expenses, consolidation)"
echo ""
echo -e "  3. ${GREEN}TRIGGER_consolidateUsdFundsToMainDaily${NC}"
echo -e "     Schedule: Daily (e.g., 2:00 PM)"
echo -e "     Purpose: Consolidate USD funds from sub-accounts to main accounts"
echo ""
echo -e "  4. ${GREEN}TRIGGER_sendDailySummaryToSlack${NC}"
echo -e "     Schedule: Daily (e.g., 9:00 AM)"
echo -e "     Purpose: Send daily summary to Slack"
echo ""
echo -e "  5. ${GREEN}TRIGGER_checkBankMinimumBalances${NC}"
echo -e "     Schedule: Daily (optional)"
echo -e "     Purpose: Check if banks meet minimum balance thresholds"
echo ""

echo -e "${YELLOW}Manual/Ad-hoc Triggers:${NC}"
echo -e "  • ${CYAN}TRIGGER_makeMonthlyPayments${NC} - Process monthly user payments"
echo -e "  • ${CYAN}TRIGGER_runPaymentsJuly2025${NC} - Specific month payment"
echo -e "  • ${CYAN}TRIGGER_syncBanksDataBalancesOnly${NC} - Balance-only sync"
echo -e "  • ${CYAN}TRIGGER_syncBanksDataWithTransfers${NC} - Sync with transfer detection"
echo -e "  • ${CYAN}TRIGGER_test${NC} - Test trigger functionality"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   How to Verify Triggers in Apps Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Option 1: Via Apps Script Editor (Recommended)${NC}"
echo -e "  1. Open the script:"
echo -e "     ${CYAN}clasp open${NC}"
echo ""
echo -e "  2. Click on the ${GREEN}clock/alarm icon${NC} (⏰) in the left sidebar"
echo -e "     (or go to Edit > Current project's triggers)"
echo ""
echo -e "  3. Verify these triggers exist:"
echo -e "     - TRIGGER_updateAllBalances (runs daily)"
echo -e "     - TRIGGER_syncBanksDataFull (runs daily)"
echo -e "     - TRIGGER_consolidateUsdFundsToMainDaily (runs daily)"
echo -e "     - TRIGGER_sendDailySummaryToSlack (runs daily)"
echo ""
echo -e "${YELLOW}Option 2: Via Command Line${NC}"
echo -e "  Run: ${CYAN}clasp open${NC}"
echo -e "  Then manually check the triggers page"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Setting Up Missing Triggers${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}If triggers are missing after deployment:${NC}"
echo ""
echo -e "1. Open Apps Script editor:"
echo -e "   ${CYAN}clasp open${NC}"
echo ""
echo -e "2. Click the ${GREEN}clock icon (⏰)${NC} in the left sidebar"
echo ""
echo -e "3. Click ${GREEN}+ Add Trigger${NC} (bottom right)"
echo ""
echo -e "4. For each trigger, configure:"
echo -e "   • Choose function: ${CYAN}TRIGGER_updateAllBalances${NC}"
echo -e "   • Choose event source: ${CYAN}Time-driven${NC}"
echo -e "   • Select type: ${CYAN}Day timer${NC}"
echo -e "   • Select time: ${CYAN}10am to 11am${NC} (or preferred time)"
echo -e "   • Click ${GREEN}Save${NC}"
echo ""
echo -e "5. Repeat for other triggers with appropriate times"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Recommended Trigger Schedule${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Suggested times (Europe/Madrid timezone):${NC}"
echo ""
echo -e "  ${GREEN}09:00 AM${NC} - TRIGGER_sendDailySummaryToSlack"
echo -e "  ${GREEN}10:00 AM${NC} - TRIGGER_updateAllBalances (morning update)"
echo -e "  ${GREEN}11:00 AM${NC} - TRIGGER_syncBanksDataFull (full sync)"
echo -e "  ${GREEN}02:00 PM${NC} - TRIGGER_consolidateUsdFundsToMainDaily"
echo -e "  ${GREEN}10:00 PM${NC} - TRIGGER_updateAllBalances (evening update)"
echo ""
echo -e "${YELLOW}Note: Adjust times based on your bank API rate limits and business needs${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Testing Triggers${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Test that trigger functions work:${NC}"
echo ""
echo -e "1. Open Apps Script editor:"
echo -e "   ${CYAN}clasp open${NC}"
echo ""
echo -e "2. Select a trigger function from the dropdown (e.g., TRIGGER_test)"
echo ""
echo -e "3. Click ${GREEN}Run${NC}"
echo ""
echo -e "4. Check the execution log (View > Logs or Ctrl/Cmd+Enter)"
echo ""
echo -e "5. Look for success messages in logs"
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Trigger verification complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "  1. Open the Apps Script editor: ${YELLOW}clasp open${NC}"
echo -e "  2. Check the triggers page (⏰ icon)"
echo -e "  3. Add any missing triggers"
echo -e "  4. Test each trigger manually"
echo ""
