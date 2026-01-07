#!/bin/bash

# Simple server health check and restart script
SERVER_DIR="/Users/wsou/Developer/proxy-banks"
LOG_FILE="$SERVER_DIR/server_check.log"
NODE_PATH="/opt/homebrew/bin/node"

# Set PATH to include homebrew binaries
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Check if server is responding
if ! curl -s -m 10 "http://localhost:8081/healthz" > /dev/null 2>&1; then
    log_message "Server not responding, restarting..."
    
    # Try PM2 restart first
    if pm2 list | grep -q "proxy-banks.*online" 2>/dev/null; then
        log_message "Restarting PM2 process..."
        pm2 restart proxy-banks
    else
        log_message "Starting PM2 process..."
        pm2 start ecosystem.config.cjs
    fi
    
    # Wait and check if it started
    sleep 5
    if curl -s -m 10 "http://localhost:8081/healthz" > /dev/null 2>&1; then
        log_message "Server restarted successfully"
    else
        log_message "Failed to restart server"
    fi
else
    log_message "Server is healthy"
fi
