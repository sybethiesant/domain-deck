#!/bin/sh
# Ensures both backend and frontend are running
# Run this after container restart: docker exec worxtech-app /app/backend/ensure-services.sh

# Check if frontend is responding
if ! curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "Frontend not responding, starting via PM2..."
    pm2 resurrect 2>/dev/null || pm2 start serve --name frontend -- -s /app/frontend/build -l 3001
    pm2 save
fi

# Check if backend is responding
if ! curl -s http://localhost:5001/api/health > /dev/null 2>&1; then
    echo "Backend not responding!"
    exit 1
fi

echo "All services running"
pm2 list
