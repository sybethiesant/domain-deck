#!/bin/sh
# WorxTech Startup Script

echo "=== WorxTech Startup ==="

# Install global packages if not present
npm list -g pm2 > /dev/null 2>&1 || npm install -g pm2
npm list -g serve > /dev/null 2>&1 || npm install -g serve

# Navigate to app directory
cd /config/workspace/WorxTech

# Install backend dependencies if needed
if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

# Install frontend dependencies and build if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Build frontend if no build exists
if [ ! -d "frontend/build" ]; then
    echo "Building frontend..."
    cd frontend && npm run build && cd ..
fi

# Start services with PM2
echo "Starting WorxTech services..."
cd /config/workspace/WorxTech/backend && pm2 start server.js --name worxtech-backend
cd /config/workspace/WorxTech/frontend && pm2 start "npx serve -s build -l 3001" --name worxtech-frontend

echo "=== WorxTech Started ==="
echo "Backend: http://localhost:5001"
echo "Frontend: http://localhost:3001"

pm2 list
