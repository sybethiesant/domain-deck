#!/bin/sh
# WorxTech startup script - starts both backend and frontend

echo "Starting WorxTech services..."

# Start backend in background
cd /app/backend
node server.js &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
sleep 3

# Start frontend serve
cd /app/frontend
serve -s build -l 3001 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

# Keep container running and handle signals
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either process to exit
wait
