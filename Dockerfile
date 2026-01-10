# WorxTech Domain Reseller - Production Dockerfile
FROM node:20-alpine

# Install PM2 and serve globally
RUN npm install -g pm2 serve

# Create app directory
WORKDIR /app

# Copy package files first (better caching)
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm install --production
RUN cd frontend && npm install

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build frontend
RUN cd frontend && npm run build

# Expose ports (backend on 5001, frontend on 3001)
EXPOSE 5001 3001

# Create PM2 ecosystem file
RUN echo '{\
  "apps": [\
    {\
      "name": "worxtech-backend",\
      "cwd": "/app/backend",\
      "script": "server.js",\
      "env": {\
        "NODE_ENV": "production"\
      }\
    },\
    {\
      "name": "worxtech-frontend",\
      "cwd": "/app/frontend",\
      "script": "npx",\
      "args": "serve -s build -l 3001"\
    }\
  ]\
}' > /app/ecosystem.config.json

# Start with PM2 in foreground
CMD ["pm2-runtime", "start", "/app/ecosystem.config.json"]
