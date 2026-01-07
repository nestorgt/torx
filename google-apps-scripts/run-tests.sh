#!/bin/bash

# Run tests for Torx Google Apps Script
# Tests are deployed and run in the Apps Script environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

cd "$(dirname "$0")"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Torx Unit Test Runner${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if clasp is installed
if ! command -v clasp &> /dev/null; then
    echo -e "${RED}❌ Error: clasp is not installed${NC}"
    echo -e "${YELLOW}   Install it with: npm install -g @google/clasp${NC}"
    exit 1
fi

TEST_MODE="${1:-all}"

echo -e "${YELLOW}📦 Deploying code and tests to Google Apps Script...${NC}"
echo ""

# First, deploy the code (src + tests)
# Temporarily modify .clasp.json to include both src and tests
echo -e "${BLUE}Preparing test deployment...${NC}"

# Create temporary config that includes both src and tests
cat > .clasp.json.tmp << EOF
{
  "scriptId": "19iTh2RalnshKPz12nQXToqXJSdeceCQecP5yug2ulgcwtVLh6kAPFUra",
  "rootDir": "."
}
EOF

# Create temporary .claspignore
cat > .claspignore.tmp << EOF
**/**
!src/**/*.gs
!tests/**/*.gs
!src/appsscript.json
EOF

# Backup original files
[ -f .clasp.json ] && mv .clasp.json .clasp.json.backup
[ -f .claspignore ] && mv .claspignore .claspignore.backup

# Use temporary files
mv .clasp.json.tmp .clasp.json
mv .claspignore.tmp .claspignore

# Push to Apps Script
if clasp push --force; then
    echo ""
    echo -e "${GREEN}✅ Code deployed successfully${NC}"
    echo ""
else
    echo -e "${RED}❌ Deployment failed${NC}"
    # Restore original files
    [ -f .clasp.json.backup ] && mv .clasp.json.backup .clasp.json
    [ -f .claspignore.backup ] && mv .claspignore.backup .claspignore
    exit 1
fi

# Restore original files
rm -f .clasp.json .claspignore
[ -f .clasp.json.backup ] && mv .clasp.json.backup .clasp.json
[ -f .claspignore.backup ] && mv .claspignore.backup .claspignore

# Run tests based on mode
case "$TEST_MODE" in
    "all")
        echo -e "${BLUE}🧪 Running all tests...${NC}"
        echo ""
        clasp run runAllTests
        ;;
    "smoke")
        echo -e "${BLUE}🔥 Running smoke tests...${NC}"
        echo ""
        clasp run runSmokeTests
        ;;
    *)
        echo -e "${RED}❌ Invalid test mode: $TEST_MODE${NC}"
        echo -e "${YELLOW}Usage: ./run-tests.sh [all|smoke]${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Test run complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}View detailed logs:${NC}"
echo -e "  ${YELLOW}clasp logs${NC}"
echo ""
