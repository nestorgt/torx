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
    
    # Kill existing server processes
    pkill -f "node server.js" 2>/dev/null
    sleep 3
    
    # Start server
    cd "$SERVER_DIR"
    nohup "$NODE_PATH" server.js > server.log 2>&1 &
    
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
