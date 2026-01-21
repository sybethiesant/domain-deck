module.exports = {
  apps: [
    {
      name: "worxtech-api",
      cwd: "/app/backend",
      script: "server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 5001
      }
    },
    {
      name: "worxtech-frontend",
      cwd: "/app/frontend",
      script: "/usr/local/bin/serve",
      args: "-s build -l 3001",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M"
    }
  ]
};
