#!/bin/sh
set -e

if [ ! -f /app/.setup_complete ]; then
    echo "Running first-time setup..."
    apk add --no-cache openssh sudo bash
    
    id claude >/dev/null 2>&1 || adduser -D -s /bin/bash claude
    
    grep -q "^claude" /etc/sudoers || echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
    mkdir -p /home/claude/.ssh
    cat > /home/claude/.ssh/authorized_keys << 'EOF'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO6lWBUkaY7r2t+SCpZOODD9dHWvIGTBx/YaUAHSgkkL mshaw83@gmail.com
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDW7BrfMhrjrRgo2URmmYYFkOEUxvg5EGt0baPUIj4R6eH8e90Gx5KDGr2Jr9KIA7u13zuCv6ORv7jgcblQjMQDuxo4xPA3bJlvhb1AVPifAE+oetUYcMxypBFiBf961goNwI/zFZtesMNqf6GY8+XUas7s6Co3rMX26YySFz8QsGW+RzsDOJTS9cvjkfS1oRWxTedHnlpdAUbVJEAYcCceWUDocBErlTLKd0GDj4xxW8pF6pvfAgt8uesXEK250DQxnT+4gB9LDOK743KWiF9BJZEsQGBb8w4KcKKgG8eNAUecFxkE7eaCOa7dzd+MjnKIXLIfPkMYO+y6dlEsy2ybREPbHy1Bg+L6IT9NxuuIvb2UDTMre9IWLK0ckCxoPWvR7Do5czZZkqEaU3lmQISaSH+dRHQf2BcxYuIAX0Gx4GG3MXcMXx4Y5Gc3yRNww4PAS01Mu+wH/HKvZFrrvyLuU0z5y0591NmYHFvONIva2yOZziH89FMJq/Wa8Hdr6bE= mshaw@Mike-UFO
EOF
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
