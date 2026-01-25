#!/bin/sh
# Domain Reseller Startup Script

echo "=== Application Startup ==="

# Install global packages if not present
npm list -g pm2 > /dev/null 2>&1 || npm install -g pm2
npm list -g serve > /dev/null 2>&1 || npm install -g serve

# Navigate to app directory (set APP_DIR to your installation path)
APP_DIR="${APP_DIR:-/app}"
cd "$APP_DIR"

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
echo "Starting application services..."
cd "$APP_DIR/backend" && pm2 start server.js --name domain-api
cd "$APP_DIR/frontend" && pm2 start "npx serve -s build -l 3001" --name domain-frontend

echo "=== Application Started ==="
echo "Backend: http://localhost:5001"
echo "Frontend: http://localhost:3001"

pm2 list
