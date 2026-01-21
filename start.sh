#\!/bin/bash
# WorxTech startup script - run after container restart
cd /app
pm2 resurrect 2>/dev/null || pm2 start /app/ecosystem.config.js
pm2 save
echo Services started:
pm2 status

