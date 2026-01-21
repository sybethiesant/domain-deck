#!/bin/sh
set -e

if [ ! -f /app/.setup_complete ]; then
    echo "Running first-time setup..."
    apk add --no-cache openssh sudo bash
    
    id claude >/dev/null 2>&1 || adduser -D -s /bin/bash claude
    
    grep -q "^claude" /etc/sudoers || echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
    mkdir -p /home/claude/.ssh
    echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO6lWBUkaY7r2t+SCpZOODD9dHWvIGTBx/YaUAHSgkkL mshaw83@gmail.com" > /home/claude/.ssh/authorized_keys
    chown -R claude:claude /home/claude
    chmod 700 /home/claude/.ssh
    chmod 600 /home/claude/.ssh/authorized_keys
    
    sed -i "s/#Port 22/Port 2223/" /etc/ssh/sshd_config
    ssh-keygen -A
    
    npm install -g serve pm2
    cd /app/backend && npm install --production
    
    touch /app/.setup_complete
    echo "Setup complete!"
fi

passwd -u claude 2>/dev/null || true
/usr/sbin/sshd

cd /app
exec pm2-runtime ecosystem.config.js
