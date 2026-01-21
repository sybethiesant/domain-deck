module.exports = {
  apps: [
    {
      name: "backend",
      cwd: "/app/backend",
      script: "server.js",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000
    },
    {
      name: "frontend",
      cwd: "/app/frontend",
      script: "npx",
      args: ["serve", "-s", "build", "-l", "3001"],
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000
    }
  ]
};
