#!/bin/bash
set -e

echo "=== QQ Bot 管理后台自动部署开始 ==="
echo "时间: $(date)"

cd /home/ubuntu/qq-bot

echo "📥 拉取最新代码..."
git pull origin main

echo "🔨 构建管理后台镜像..."
docker compose build admin-api admin-web

echo "🗄️ 执行数据库迁移（如有需要）..."
# 使用 admin-api 镜像执行数据库迁移
docker compose run --rm --no-deps admin-api npx prisma@6.19.0 migrate deploy || {
  echo "⚠️ 数据库迁移失败或无需迁移，继续部署..."
}

echo "🚀 启动管理后台服务..."
docker compose up -d --no-deps admin-api admin-web

echo "🧹 清理未使用的Docker资源..."
docker image prune -f
docker builder prune -f

echo "✅ 部署完成！"
echo "📊 查看容器状态："
docker compose ps admin-api admin-web
echo ""
echo "🌐 访问地址："
echo "  - 前端: http://localhost:8080"
echo "  - API: http://localhost:3001/health"
echo ""
echo "💾 磁盘使用："
df -h / | grep /dev/root
