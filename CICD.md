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
│  5. deploy job 派发到 self-hosted runner │
└──────────────────────────────────────────┘
        ↓ runner（出站连 GitHub，无需开放入站端口）
┌──────────────────────────────────────────┐
│  服务器 (与 Hermes Agent 同机)           │
│  systemd: actions.runner.* 服务          │
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

## 🔑 配置 GitHub Actions 自动部署（Self-hosted Runner）

部署用的是 GitHub Actions **self-hosted runner**，跑在本机以 systemd 服务存活。GitHub 推工作流时由本地 runner 主动接单，无需公网开放 SSH 端口、无需在 GitHub 配置 SSH 密钥。

### 步骤 1：在 GitHub 注册 runner（首次部署或换机器时）

1. 打开 https://github.com/joyehuang/qq-bot/settings/actions/runners/new ，OS 选 Linux，Arch 选 x64
2. 复制页面给出的 `--token AXXX...` 那一段
3. 在服务器执行：

```bash
mkdir -p ~/actions-runner/qqbot && cd ~/actions-runner/qqbot
curl -fsSLo runner.tar.gz \
  "https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64.tar.gz"
tar xzf runner.tar.gz
./config.sh --url https://github.com/joyehuang/qq-bot \
  --token <PASTE_TOKEN_HERE> \
  --unattended --name qqbot-runner --labels qqbot --replace
sudo ./svc.sh install ubuntu
sudo ./svc.sh start
```

> 当前 runner 已装在 `/home/ubuntu/actions-runner/qqbot/`，由 systemd 服务 `actions.runner.joyehuang-qq-bot.qqbot-runner.service` 管理。

### 步骤 2：（一次性）GitHub 安全设置

> Public repo 跑 self-hosted runner 必须做这一步，避免 fork PR 在你服务器上跑陌生人代码：

打开 https://github.com/joyehuang/qq-bot/settings/actions ，在 "Fork pull request workflows from outside collaborators" 选 **"Require approval for all outside collaborators"**。

### 步骤 3：清理（如有）旧的 SSH 部署 secrets

旧 secrets `EC2_HOST` / `EC2_USER` / `EC2_SSH_KEY` / `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY` 都不再使用，去 https://github.com/joyehuang/qq-bot/settings/secrets/actions 删除。

### 步骤 4：测试自动部署

```bash
# 本地随便改个文件，push 一下
git commit --allow-empty -m "test: 触发自动部署"
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
2. ✅ self-hosted runner 直接执行 `scripts/deploy.sh`：`git pull` → `npm ci`（仅 lockfile 变化时）→ `prisma generate/migrate deploy` → `pm2 reload qq-bot`
3. ⏭️ 不构建任何 Docker 镜像

### 改 Admin Server / Admin Web

```bash
vim admin/server/src/...
git commit -am "..."
git push
```

GHA 自动构建 GHCR 镜像 → self-hosted runner 执行 `docker compose pull admin-api && docker compose up -d`。

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

### GHA `deploy` 步骤一直 queued / runner offline

```bash
# 在服务器上检查 runner 服务状态
sudo systemctl status actions.runner.joyehuang-qq-bot.qqbot-runner.service

# 看实时日志
sudo journalctl -u actions.runner.joyehuang-qq-bot.qqbot-runner.service -f
```

GitHub 这边可在 https://github.com/joyehuang/qq-bot/settings/actions/runners 查看 runner 是否 Idle。如果 Offline：

```bash
cd ~/actions-runner/qqbot
sudo ./svc.sh start
```

如果 token 失效或 runner 损坏，重新注册见上面"步骤 1：在 GitHub 注册 runner"。

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

## 💾 数据库备份

数据库 `prisma/dev.db` 是 SQLite 单文件，需要主动备份（之前曾因没备份丢过一次数据）。

### 本地分层备份

`scripts/backup-db.sh` 会：

1. 用 `sqlite3 .backup` 在线热备份（不阻塞写入，输出文件页边界一致；比 `cp` 安全）
2. 按北京时间归档到 `/mnt/hermes-data/community/backups/qq-bot/{daily,weekly,monthly}/`
3. 滚动保留：daily 7 份 + weekly 4 份 + monthly 12 份（共 ~23 份覆盖一整年）
4. 写一行到 `manifest.tsv`：时间戳、tier、路径、大小、sha256

直接跑试一下：

```bash
bash /mnt/hermes-data/community/projects/qq-bot/scripts/backup-db.sh
```

### 安装到 crontab

在 ubuntu 用户下挂 cron（不需要 root），北京时间凌晨 3:00：

```bash
# 临时检查现有 crontab
crontab -l

# 新增（编辑器打开）
crontab -e
```

把这一行加进去（CRON_TZ 让 crontab 按北京时间解析）：

```cron
CRON_TZ=Asia/Shanghai
0 3 * * * /usr/bin/bash /mnt/hermes-data/community/projects/qq-bot/scripts/backup-db.sh --remote >> /mnt/hermes-data/community/backups/qq-bot/cron.log 2>&1
```

> 不带 `--remote` 就只做本地备份；带 `--remote` 会同时推送到异地（前提是配好 restic + R2）。

### 异地备份（推荐：restic + Cloudflare R2）

**为什么 R2 + restic**：R2 免费 10GB / 零 egress 费、restic 默认加密 + 块级去重，完美匹配 SQLite 数据量小但需要长期保留 + 半私密的场景。

#### 步骤 1：注册 Cloudflare R2 + 拿 API token

1. 打开 https://dash.cloudflare.com/?to=/:account/r2 → Create bucket（取个名，比如 `qq-bot-backups`）
2. R2 → Manage R2 API Tokens → Create API token，权限选 `Object Read & Write`，Bucket 限定刚才创建的 bucket
3. 记下：
   - `Access Key ID`
   - `Secret Access Key`
   - `S3-compatible endpoint`（形如 `https://<account-id>.r2.cloudflarestorage.com`）

#### 步骤 2：装 restic

```bash
sudo apt update && sudo apt install -y restic
restic version
```

#### 步骤 3：配置 restic 凭证

创建 `~/.restic-env`（备份脚本会自动 source 它）：

```bash
cat > ~/.restic-env <<'EOF'
export AWS_ACCESS_KEY_ID="<R2 Access Key ID>"
export AWS_SECRET_ACCESS_KEY="<R2 Secret Access Key>"
export RESTIC_REPOSITORY="s3:https://<account-id>.r2.cloudflarestorage.com/qq-bot-backups"
export RESTIC_PASSWORD="<挑一个长密码用来加密备份>"
EOF
chmod 600 ~/.restic-env
```

> ⚠️ `RESTIC_PASSWORD` 是 restic 用来加密备份的密钥。**丢了就找不回备份**。在 1Password / Bitwarden 之类的地方留一份。

#### 步骤 4：初始化 restic 仓库（仅一次）

```bash
set -a; source ~/.restic-env; set +a
restic init
```

输出 "created restic repository ..." 即成功。

#### 步骤 5：测试推送

```bash
bash /mnt/hermes-data/community/projects/qq-bot/scripts/backup-db.sh --remote
restic snapshots   # 应能看到一条新的 snapshot
```

### 恢复流程（演练）

```bash
# 列所有 snapshots
restic snapshots

# 恢复某个 snapshot 到临时目录
restic restore <snapshot-id> --target /tmp/restore

# 找出里面的 .sqlite 文件
ls /tmp/restore/mnt/hermes-data/community/backups/qq-bot/daily/

# 用恢复出来的快照替换当前 dev.db（先 stop bot）
pm2 stop qq-bot
cp /tmp/restore/mnt/hermes-data/community/backups/qq-bot/daily/db_2026-XX-XX.sqlite \
   /mnt/hermes-data/community/projects/qq-bot/prisma/dev.db
pm2 start qq-bot
```

### 备份监控

每天凌晨 3:00 后看 `/mnt/hermes-data/community/backups/qq-bot/cron.log` 末尾几行确认有 `✅ 本地备份完成`。如果连续几天没有这一行，说明 cron 没跑或 sqlite3 出错。

---

## 📖 相关文档

- 项目 PRD：[`PRD_QQBot_Hermes_Integration.md`](./PRD_QQBot_Hermes_Integration.md)
- PM2 文档：https://pm2.keymetrics.io/docs/usage/quick-start/
- Prisma migrate deploy：https://www.prisma.io/docs/concepts/components/prisma-migrate/migrate-deployments
- restic：https://restic.readthedocs.io/
- Cloudflare R2：https://developers.cloudflare.com/r2/
