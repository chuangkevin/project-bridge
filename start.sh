#!/bin/bash
# Production start script for Project Bridge
# Usage: bash start.sh

set -e

# Kill existing processes on our ports
for PORT in 3003 5191; do
  PID=$(netstat -ano 2>/dev/null | findstr ":$PORT" | findstr "LISTEN" | awk '{print $5}' | head -1)
  if [ -n "$PID" ] && [ "$PID" != "0" ]; then
    echo "Killing existing process on port $PORT (PID $PID)..."
    taskkill //PID $PID //F 2>/dev/null || true
    sleep 1
  fi
done

# Start server (compiled JS)
echo "Starting server on port 3003..."
cd packages/server
node dist/index.js &
SERVER_PID=$!
cd ../..

# Start client (vite dev or serve dist)
echo "Starting client on port 5191..."
cd packages/client
npx vite --port 5191 --host 0.0.0.0 &
CLIENT_PID=$!
cd ../..

echo ""
echo "Waiting for services..."
sleep 8

# Verify
S=$(netstat -ano 2>/dev/null | findstr ":3003" | findstr "LISTEN" | wc -l)
C=$(netstat -ano 2>/dev/null | findstr ":5191" | findstr "LISTEN" | wc -l)

echo ""
if [ "$S" -gt 0 ]; then echo "✅ Server: http://localhost:3003 (PID $SERVER_PID)"; else echo "❌ Server failed to start"; fi
if [ "$C" -gt 0 ]; then echo "✅ Client: http://localhost:5191 (PID $CLIENT_PID)"; else echo "❌ Client failed to start"; fi
echo ""
echo "Press Ctrl+C to stop both."
wait
