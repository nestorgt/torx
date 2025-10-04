#!/bin/bash

# USD Balance Monitoring Script
# Scheduled via cron for automatic balance checking
# Exit codes: 0 = OK, 1 = Error, 2 = Low Balance Alert

cd /Users/wsou/Developer/torx/proxy-banks
source .env

echo "$(date): Starting USD balance check..."

# Run the monitoring script
node monitor-balance.js
EXIT_CODE=$?

# Log the result with timestamp
if [ $EXIT_CODE -eq 0 ]; then
  echo "$(date): USD balance OK - above $1000 threshold"
elif [ $EXIT_CODE -eq 2 ]; then
  echo "$(date): ALERT: USD balance below $1000 threshold!"
  # Could add email notification here
elif [ $EXIT_CODE -eq 1 ]; then
  echo "$(date): ERROR: Failed to check USD balance"
fi

exit $EXIT_CODE
