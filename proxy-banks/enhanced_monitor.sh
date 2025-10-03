#!/bin/bash

# Enhanced server monitoring script with multiple fallbacks
SERVER_DIR="/Users/wsou/Developer/proxy-banks"
LOG_FILE="$SERVER_DIR/server_check.log"
NODE_PATH="/opt/homebrew/bin/node"
PID_FILE="$SERVER_DIR/server.pid"
MAX_RETRIES=3
RETRY_DELAY=10

# Set PATH to include homebrew binaries
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Check if server is responding
check_server_health() {
    curl -s -m 10 "http://localhost:8081/healthz" > /dev/null 2>&1
    return $?
}

# Start server with retries
start_server() {
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        log_message "Attempting to start server (attempt $((retries + 1))/$MAX_RETRIES)..."
        
        # Kill any existing processes
        pkill -f "node server.js" 2>/dev/null
        sleep 2
        
        # Start server
        cd "$SERVER_DIR"
        nohup "$NODE_PATH" server.js > server.log 2>&1 &
        local server_pid=$!
        echo $server_pid > "$PID_FILE"
        
        # Wait and check if it started
        sleep 5
        if check_server_health; then
            log_message "Server started successfully with PID $server_pid"
            return 0
        else
            log_message "Server failed to start (attempt $((retries + 1))/$MAX_RETRIES)"
            retries=$((retries + 1))
            if [ $retries -lt $MAX_RETRIES ]; then
                sleep $RETRY_DELAY
            fi
        fi
    done
    
    log_message "Failed to start server after $MAX_RETRIES attempts"
    return 1
}

# Main monitoring logic
if check_server_health; then
    log_message "Server is healthy"
else
    log_message "Server not responding, attempting restart..."
    
    if start_server; then
        log_message "Server restart successful"
    else
        log_message "CRITICAL: Server restart failed after multiple attempts"
        
        # Send notification (you can customize this)
        # For now, just log the critical error
        log_message "ALERT: Proxy server is down and cannot be restarted automatically"
    fi
fi

# Additional health check - verify server is actually working
sleep 2
if check_server_health; then
    log_message "Final health check: Server is responding"
else
    log_message "Final health check: Server is NOT responding"
fi
