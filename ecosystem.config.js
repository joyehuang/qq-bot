// PM2 配置 — 宿主机部署 QQ Bot 主进程
// 用法：
//   pm2 start ecosystem.config.js          # 首次启动
//   pm2 reload qq-bot                      # 滚动重启（CI/CD 调用）
//   pm2 logs qq-bot                        # 查看日志
//   pm2 save && pm2 startup                # 配置开机自启（首次设置）
module.exports = {
  apps: [
    {
      name: 'qq-bot',
      cwd: __dirname,
      script: 'npx',
      args: 'ts-node src/index.ts',
      // 让 Hermes Agent CLI 可被 spawn 找到（venv shim 在 ~/.local/bin）
      env: {
        NODE_ENV: 'production',
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || ''}`,
      },
      // 进程管理
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '512M',
      // 日志
      out_file: './logs/qq-bot.out.log',
      error_file: './logs/qq-bot.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
