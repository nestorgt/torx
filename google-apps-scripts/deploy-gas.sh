#!/bin/bash

# Deploy Google Apps Script using clasp
# This script pushes the modular code to Google Apps Script

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Change to script directory
cd "$(dirname "$0")"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Torx Google Apps Script Deployment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if clasp is installed
if ! command -v clasp &> /dev/null; then
    echo -e "${RED}❌ Error: clasp is not installed${NC}"
    echo -e "${YELLOW}   Install it with: npm install -g @google/clasp${NC}"
    exit 1
fi

# Check if logged in
if ! clasp login --status &> /dev/null; then
    echo -e "${YELLOW}⚠️  You are not logged into clasp${NC}"
    echo -e "${YELLOW}   Run: clasp login${NC}"
    exit 1
fi

# Check if .clasp.json exists
if [ ! -f ".clasp.json" ]; then
    echo -e "${RED}❌ Error: .clasp.json not found${NC}"
    exit 1
fi

# Check if src directory exists
if [ ! -d "src" ]; then
    echo -e "${RED}❌ Error: src/ directory not found${NC}"
    exit 1
fi

# Count module files
MODULE_COUNT=$(find src -name "*.gs" | wc -l | tr -d ' ')
echo -e "${GREEN}📦 Found ${MODULE_COUNT} module files to deploy${NC}"
echo ""

# List modules
echo -e "${BLUE}Modules:${NC}"
find src -name "*.gs" -exec basename {} \; | sort | sed 's/^/  • /'
echo ""

# Push to Google Apps Script
echo -e "${YELLOW}📤 Pushing code to Google Apps Script...${NC}"
if clasp push --force; then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Open the script in browser: ${YELLOW}clasp open${NC}"
    echo -e "  2. Test the functions in the Apps Script editor"
    echo -e "  3. Check the custom menus in your Google Sheet"
    echo ""
else
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo -e "  1. Check your internet connection"
    echo -e "  2. Verify you're logged in: ${YELLOW}clasp login --status${NC}"
    echo -e "  3. Check .clasp.json has correct scriptId"
    echo -e "  4. Try: ${YELLOW}clasp login${NC} (to re-authenticate)"
    echo ""
    exit 1
fi
