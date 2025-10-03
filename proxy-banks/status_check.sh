#!/bin/bash

# Quick status check script
SERVER_DIR="/Users/wsou/Developer/proxy-banks"
LOG_FILE="$SERVER_DIR/server_check.log"

echo "=== Proxy Server Status Check ==="
echo "Time: $(date)"
echo

# Check if server process is running
if pgrep -f "node server.js" > /dev/null; then
    echo "✅ Server process is running"
    echo "PID: $(pgrep -f 'node server.js')"
else
    echo "❌ Server process is NOT running"
fi

echo

# Check if server responds to health check
if curl -s -m 5 "http://localhost:8081/healthz" > /dev/null 2>&1; then
    echo "✅ Server health check: OK"
else
    echo "❌ Server health check: FAILED"
fi

echo

# Check recent logs
echo "=== Recent Server Activity ==="
if [ -f "$LOG_FILE" ]; then
    echo "Last 5 entries from server_check.log:"
    tail -5 "$LOG_FILE"
else
    echo "No server_check.log found"
fi

echo

# Check cron jobs
echo "=== Monitoring Status ==="
echo "Active cron jobs:"
crontab -l 2>/dev/null | grep -E "(check_server|enhanced_monitor)" || echo "No monitoring cron jobs found"

echo
echo "=== Server Logs (last 10 lines) ==="
if [ -f "$SERVER_DIR/server.log" ]; then
    tail -10 "$SERVER_DIR/server.log"
else
    echo "No server.log found"
fi
