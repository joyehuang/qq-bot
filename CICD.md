# CI/CD 与部署说明

> 本项目部署在与 Hermes Agent 同一台服务器上。Bot 主程序通过 PM2 直接在宿主机运行（便于无成本调用 `hermes` CLI），管理后台仍以 Docker 容器形式运行。

---

## 🏗️ 架构概览

```
本地 push → main
        ↓
┌──────────────────────────────────────────┐
│  GitHub Actions                          │
│  1. detect-changes  (paths-filter)       │
│  2. check-bot       (tsc --noEmit)       │
│  3. check-admin-*   (tsc --noEmit)       │
│  4. build-admin-server / admin-web 镜像  │
│     → 推送到 ghcr.io                     │
│  5. deploy: SSH 到服务器                 │
└──────────────────────────────────────────┘
        ↓ ssh
┌──────────────────────────────────────────┐
│  服务器 (与 Hermes Agent 同机)           │
│                                          │
│  scripts/deploy.sh                       │
│   ├─ git fetch + reset --hard origin/main│
│   ├─ Bot   → npm ci (按需) + prisma     │
│   │         migrate deploy + pm2 reload │
│   └─ Admin → docker compose pull + up   │
│                                          │
│  ─ 宿主机                                │
│    └─ PM2: qq-bot  ──→  hermes CLI      │
│  ─ Docker                                │
│    ├─ napcat                             │
│    ├─ admin-api  (8080→3001)             │
│    └─ admin-web  (8080)                  │
└──────────────────────────────────────────┘
```

**为什么 Bot 不在 Docker 里？**  
Bot 需要调用宿主机的 `hermes` 命令（实际是 Python venv shim，依赖 `~/.hermes/` 配置）。直接在宿主机用 PM2 运行能避免 mount Python 解释器/venv 等脆弱配置，hermes 升级也能立刻生效。隔离性主要由 `community` profile 的 cwd 限制和 toolset 裁剪保证，跟容器化无关。

---

## 🚀 首次部署（人工步骤）

> 以下步骤需要你在服务器上执行一次。完成后 GHA 才能自动部署。

### 步骤 1：安装 PM2（系统级）

```bash
sudo npm install -g pm2
pm2 -v   # 确认安装成功
```

### 步骤 2：拉取代码到目标位置

```bash
# 本项目已经在 /mnt/hermes-data/community/projects/qq-bot/，跳过即可
# 如果是新机器：
cd /mnt/hermes-data/community/projects/
git clone git@github.com:joyehuang/qq-bot.git
cd qq-bot
```

### 步骤 3：准备 `.env`

```bash
cp .env.example .env
nano .env
```

至少需要填：
- `DATABASE_URL="file:./dev.db"`（已默认）
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `JWT_SECRET`（管理后台）
- `GHCR_TOKEN` / `GITHUB_REPOSITORY_OWNER`（拉取 admin 镜像，私有仓库需要）

### 步骤 4：装依赖 & 初始化数据库

```bash
npm ci
npx prisma@6.19.0 generate
npx prisma@6.19.0 migrate deploy
```

### 步骤 5：首次启动 Bot（PM2）

```bash
pm2 start ecosystem.config.js
pm2 logs qq-bot --lines 50    # 确认启动正常
pm2 save                      # 保存当前进程列表
pm2 startup                   # 输出一行 sudo 命令，按提示执行
```

`pm2 startup` 那行 sudo 命令执行后，机器重启时 PM2 会自动恢复 qq-bot 进程。

### 步骤 6：启动管理后台（Docker）

```bash
docker login ghcr.io -u <你的 GitHub 用户名>   # 私有镜像才需要
docker compose pull admin-api admin-web
docker compose up -d napcat admin-api admin-web
```

---

## 🔑 配置 GitHub Actions 自动部署

### 步骤 1：在服务器上为 GHA 生成专用 SSH key

```bash
ssh-keygen -t ed25519 -C "github-actions-qq-bot" -f ~/.ssh/qqbot_gha -N ""
cat ~/.ssh/qqbot_gha.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/qqbot_gha    # 复制这个**私钥**全部内容
```

### 步骤 2：在 GitHub 仓库设置 Secrets

打开 https://github.com/joyehuang/qq-bot/settings/secrets/actions 添加：

| Secret 名 | 值 |
|----------|-----|
| `SERVER_HOST` | 你服务器的固定公网 IP 或域名 |
| `SERVER_USER` | `ubuntu`（或其他能访问 `/mnt/hermes-data/...` 的用户） |
| `SERVER_SSH_KEY` | 上一步复制的**私钥**全部内容（包括 `-----BEGIN/END-----` 行） |

> 旧 secrets `EC2_HOST` / `EC2_USER` / `EC2_SSH_KEY` 不再使用，可以删掉。

### 步骤 3：测试自动部署

```bash
# 本地随便改个文件，push 一下
git commit --allow-empty -m "test: 触发首次自动部署"
git push origin main
```

打开 https://github.com/joyehuang/qq-bot/actions 看 workflow 是否走完。

---

## 📝 日常使用

### 改 Bot 代码 → push → 自动 PM2 reload

```bash
vim src/index.ts
git commit -am "feat: ..."
git push
```

GHA 自动：
1. ✅ 类型检查
2. ✅ SSH 到服务器：`git pull` → `npm ci`（仅 lockfile 变化时）→ `prisma generate/migrate deploy` → `pm2 reload qq-bot`
3. ⏭️ 不构建任何 Docker 镜像

### 改 Admin Server / Admin Web

```bash
vim admin/server/src/...
git commit -am "..."
git push
```

GHA 自动构建 GHCR 镜像 → SSH 到服务器 → `docker compose pull admin-api && docker compose up -d`。

### 改 Prisma schema

`prisma/**` 同时触发 bot 和 admin-server 的更新流程，迁移会被 `prisma migrate deploy` 自动应用。

### 只改文档（README/CICD.md 等）

不会触发任何构建或部署 — 节省时间。

---

## 🔧 运维常用命令

```bash
# Bot
pm2 status                  # 进程列表
pm2 logs qq-bot             # 实时日志
pm2 logs qq-bot --lines 200 # 最近 200 行
pm2 reload qq-bot           # 滚动重启（无停机）
pm2 restart qq-bot          # 强制重启
pm2 monit                   # 实时监控

# 管理后台
docker compose ps
docker compose logs -f admin-api
docker compose logs -f admin-web
docker compose restart admin-api

# 手动触发完整部署（不依赖 GHA）
cd /mnt/hermes-data/community/projects/qq-bot
UPDATE_BOT=true UPDATE_ADMIN_SERVER=true UPDATE_ADMIN_WEB=true bash scripts/deploy.sh
```

---

## 🩺 故障排查

### Bot 进程状态显示 errored

```bash
pm2 logs qq-bot --err --lines 100
```

常见原因：
- `hermes` 不在 PATH → 检查 `ecosystem.config.js` 里 `env.PATH` 是否包含 `~/.local/bin`
- TypeScript 编译错误 → 本地 `npx tsc --noEmit` 复现
- 数据库连接失败 → 检查 `prisma/dev.db` 是否存在 + `.env` 里 `DATABASE_URL`

### GHA `deploy` 步骤超时 / SSH 失败

- 检查服务器 IP 是否变了（`SERVER_HOST` 需要更新）
- 服务器 22 端口是否对外开放
- `~/.ssh/authorized_keys` 是否还包含 `~/.ssh/qqbot_gha.pub` 的内容

### Admin 镜像拉取失败 `denied`

```bash
# 私有仓库镜像，需要 PAT 登录
echo $GHCR_TOKEN | docker login ghcr.io -u $GITHUB_REPOSITORY_OWNER --password-stdin
```

`GHCR_TOKEN` 是 GitHub PAT（classic），权限勾 `read:packages`。

### `pm2 reload` 后行为没变化

- 检查代码确实 pull 下来了：`git log -1 --oneline`
- ts-node 没 cache，但有时第三方库的 require cache 残留 → 改用 `pm2 restart qq-bot`

---

## 📊 监控

- GHA 运行状态：https://github.com/joyehuang/qq-bot/actions
- GHCR 镜像：https://github.com/joyehuang?tab=packages

---

## 📖 相关文档

- 项目 PRD：[`PRD_QQBot_Hermes_Integration.md`](./PRD_QQBot_Hermes_Integration.md)
- PM2 文档：https://pm2.keymetrics.io/docs/usage/quick-start/
- Prisma migrate deploy：https://www.prisma.io/docs/concepts/components/prisma-migrate/migrate-deployments
