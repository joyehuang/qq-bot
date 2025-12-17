#!/bin/bash
set -e

echo "=== QQ Bot 智能部署开始 ==="
echo "时间: $(date)"

cd /home/ubuntu/qq-bot

# 接收 GitHub Actions 传来的参数
UPDATE_BOT=${UPDATE_BOT:-true}
UPDATE_ADMIN_SERVER=${UPDATE_ADMIN_SERVER:-true}
UPDATE_ADMIN_WEB=${UPDATE_ADMIN_WEB:-true}
GITHUB_REPOSITORY_OWNER=${GITHUB_REPOSITORY_OWNER:-joyehuang}

echo "📊 部署参数:"
echo "  - 更新 Bot: $UPDATE_BOT"
echo "  - 更新 Admin Server: $UPDATE_ADMIN_SERVER"
echo "  - 更新 Admin Web: $UPDATE_ADMIN_WEB"
echo "  - GitHub Owner: $GITHUB_REPOSITORY_OWNER"

echo "📥 拉取最新代码..."
git pull origin main

echo "🔍 检查文件完整性..."
if git diff --quiet HEAD; then
  echo "✅ 所有文件与远程版本一致"
else
  echo "⚠️ 检测到本地修改，恢复到远程版本..."
  git restore .
fi

# 加载环境变量（确保有 GHCR token）
if [ -f .env ]; then
  echo "📄 加载环境变量..."
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "⚠️ .env 文件不存在，请确保已配置 GHCR_TOKEN"
fi

echo "🔐 登录到 GitHub Container Registry..."
if [ -n "$GHCR_TOKEN" ]; then
  echo $GHCR_TOKEN | docker login ghcr.io -u $GITHUB_REPOSITORY_OWNER --password-stdin
else
  echo "⚠️ GHCR_TOKEN 未设置，尝试使用已缓存的凭据..."
fi

# 导出环境变量供 docker-compose 使用
export GITHUB_REPOSITORY_OWNER

# 智能拉取：只拉取有更新的镜像
SERVICES_TO_UPDATE=""

if [ "$UPDATE_BOT" = "true" ]; then
  echo "📦 拉取 bot 镜像..."
  docker compose pull bot || echo "⚠️ bot 镜像拉取失败，使用现有镜像"
  SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE bot"
fi

if [ "$UPDATE_ADMIN_SERVER" = "true" ]; then
  echo "📦 拉取 admin-api 镜像..."
  docker compose pull admin-api || echo "⚠️ admin-api 镜像拉取失败，使用现有镜像"
  SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE admin-api"
fi

if [ "$UPDATE_ADMIN_WEB" = "true" ]; then
  echo "📦 拉取 admin-web 镜像..."
  docker compose pull admin-web || echo "⚠️ admin-web 镜像拉取失败，使用现有镜像"
  SERVICES_TO_UPDATE="$SERVICES_TO_UPDATE admin-web"
fi

if [ -z "$SERVICES_TO_UPDATE" ]; then
  echo "ℹ️ 没有服务需要更新"
  exit 0
fi

# 如果 bot 需要更新，先执行数据库迁移
if [[ "$SERVICES_TO_UPDATE" == *"bot"* ]]; then
  echo "🗄️ 执行数据库迁移..."
  docker compose run --rm --no-deps bot npx prisma@6.19.0 migrate deploy || {
    echo "⚠️ 数据库迁移失败，但继续部署..."
  }
fi

echo "🚀 重启服务: $SERVICES_TO_UPDATE"
docker compose up -d --no-deps $SERVICES_TO_UPDATE

echo "🧹 清理未使用的 Docker 资源..."
docker image prune -f
docker builder prune -f

echo "✅ 部署完成！"
echo "📊 查看容器状态："
docker compose ps

echo "💾 磁盘使用："
df -h / | grep /dev/root || df -h /
