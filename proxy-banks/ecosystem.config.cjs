module.exports = {
  apps: [{
    name: 'proxy-banks',
    script: 'server.js',
    cwd: '/Users/wsou/Developer/torx/proxy-banks',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8081
    },
    error_file: '/Users/wsou/Developer/torx/proxy-banks/pm2-error.log',
    out_file: '/Users/wsou/Developer/torx/proxy-banks/pm2-out.log',
    log_file: '/Users/wsou/Developer/torx/proxy-banks/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
