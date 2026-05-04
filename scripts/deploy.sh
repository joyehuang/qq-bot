#!/usr/bin/env bash
# 部署脚本：与 Hermes Agent 同机部署，由 GHA SSH 调用。
#
# 调用方需要 cd 到项目根目录后执行 `bash scripts/deploy.sh`。
# 输入环境变量：
#   UPDATE_BOT             — bot 是否需要更新（true/false）
#   UPDATE_ADMIN_SERVER    — admin-api 是否需要更新
#   UPDATE_ADMIN_WEB       — admin-web 是否需要更新
#   GITHUB_REPOSITORY_OWNER — GHCR 镜像 owner（默认 joyehuang）

set -euo pipefail

UPDATE_BOT="${UPDATE_BOT:-true}"
UPDATE_ADMIN_SERVER="${UPDATE_ADMIN_SERVER:-false}"
UPDATE_ADMIN_WEB="${UPDATE_ADMIN_WEB:-false}"
export GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-joyehuang}"

echo "=== QQ Bot 部署 $(date '+%Y-%m-%d %H:%M:%S') ==="
echo "  - 更新 Bot:          $UPDATE_BOT"
echo "  - 更新 Admin Server: $UPDATE_ADMIN_SERVER"
echo "  - 更新 Admin Web:    $UPDATE_ADMIN_WEB"

# ----- 1. 拉取最新代码 -----
echo ""
echo "📥 拉取最新代码..."
git fetch origin main
# 如果工作树有未提交的变更，记录但不丢弃；reset 仅作用于 tracked 文件
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️ 工作树存在本地修改，将被覆盖："
  git status --short
fi
git reset --hard origin/main

# ----- 2. GHCR 登录（admin 镜像需要） -----
if [ "$UPDATE_ADMIN_SERVER" = "true" ] || [ "$UPDATE_ADMIN_WEB" = "true" ]; then
  if [ -f .env ]; then
    set -a; source .env; set +a
  fi
  if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "🔐 登录 GHCR..."
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GITHUB_REPOSITORY_OWNER" --password-stdin
  fi
fi

# ----- 3. Bot：宿主机 PM2 -----
if [ "$UPDATE_BOT" = "true" ]; then
  echo ""
  echo "🤖 更新 Bot（宿主机 PM2）..."

  # 仅当 lockfile 变化时才重装依赖（CI/CD 加速）
  if ! git diff --quiet HEAD@{1} HEAD -- package-lock.json package.json 2>/dev/null; then
    echo "  📦 检测到依赖变更，运行 npm ci..."
    npm ci --prefer-offline --no-audit
  else
    echo "  📦 依赖无变更，跳过 npm ci"
  fi

  echo "  🔧 prisma generate..."
  npx prisma@6.19.0 generate

  echo "  🗄️ prisma migrate deploy..."
  npx prisma@6.19.0 migrate deploy

  if pm2 describe qq-bot >/dev/null 2>&1; then
    echo "  🔄 pm2 reload qq-bot..."
    pm2 reload qq-bot --update-env
  else
    echo "  🚀 首次启动 pm2 start ecosystem.config.js..."
    pm2 start ecosystem.config.js
    pm2 save
  fi
fi

# ----- 4. Admin 服务：Docker -----
SERVICES=()
if [ "$UPDATE_ADMIN_SERVER" = "true" ]; then SERVICES+=(admin-api); fi
if [ "$UPDATE_ADMIN_WEB" = "true" ]; then SERVICES+=(admin-web); fi

if [ ${#SERVICES[@]} -gt 0 ]; then
  echo ""
  echo "🐳 更新 Admin 服务: ${SERVICES[*]}"
  for svc in "${SERVICES[@]}"; do
    docker compose pull "$svc" || echo "⚠️ 拉取 $svc 镜像失败，沿用旧镜像"
  done
  docker compose up -d --no-deps "${SERVICES[@]}"
fi

# ----- 5. 清理 -----
echo ""
echo "🧹 清理未使用的 Docker 镜像..."
docker image prune -f >/dev/null 2>&1 || true

echo ""
echo "✅ 部署完成"
echo "查看 bot 日志:   pm2 logs qq-bot"
echo "查看 admin 日志: docker compose logs -f admin-api admin-web"
