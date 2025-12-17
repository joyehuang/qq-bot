#!/bin/bash
set -e

echo "=== QQ Bot 自动部署开始 ==="
echo "时间: $(date)"

cd /home/ubuntu/qq-bot

echo "📥 拉取最新代码..."
git pull origin main

echo "🔍 调试：检查 schema.prisma 内容..."
echo "--- schema.prisma 前 15 行 ---"
head -15 prisma/schema.prisma
echo "--- 结束 ---"

echo "🔨 构建新的 bot 镜像（强制不使用缓存）..."
docker compose build --no-cache bot

echo "🗄️ 执行数据库迁移..."
# 使用新镜像执行数据库迁移（不启动完整服务，只执行迁移）
docker compose run --rm --no-deps bot npx prisma migrate deploy || {
  echo "⚠️ 数据库迁移失败，但继续部署..."
}

echo "🚀 启动 bot 容器..."
docker compose up -d --no-deps bot

echo "🧹 清理未使用的Docker资源..."
docker image prune -f
docker builder prune -f

echo "✅ 部署完成！"
echo "📊 查看容器状态："
docker compose ps
echo "💾 磁盘使用："
df -h / | grep /dev/root
