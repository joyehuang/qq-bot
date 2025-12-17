# CI/CD 智能部署系统说明

## 🎯 概述

本项目使用智能 CI/CD 系统，基于文件变更自动检测、构建和部署，节省资源和时间。

## 🏗️ 架构设计

### 工作流程

```
Push 到 main 分支
    ↓
检测文件变更 (detect-changes)
    ├─ Bot 代码变更?
    ├─ Admin Server 变更?
    └─ Admin Web 变更?
    ↓
条件执行类型检查
    ├─ check-bot (如果 bot 变更)
    ├─ check-admin-server (如果 admin-server 变更)
    └─ check-admin-web (如果 admin-web 变更)
    ↓
条件构建镜像 (只构建变更的模块)
    ├─ build-bot → ghcr.io/joyehuang/qq-bot:latest
    ├─ build-admin-server → ghcr.io/joyehuang/qq-bot-admin-server:latest
    └─ build-admin-web → ghcr.io/joyehuang/qq-bot-admin-web:latest
    ↓
智能部署到服务器
    └─ 只拉取和重启变更的服务
```

## 📦 变更检测规则

### Bot 主程序
触发条件：以下任一文件变更
- `src/**` - Bot 源代码
- `prisma/**` - 数据库 schema
- `package*.json` - 依赖配置
- `Dockerfile` - Bot 镜像配置
- `tsconfig.json` - TypeScript 配置

### Admin Server
触发条件：以下任一文件变更
- `admin/server/**` - Admin Server 源代码
- `prisma/**` - 数据库 schema（共享）

### Admin Web
触发条件：以下任一文件变更
- `admin/web/**` - Admin Web 源代码

## 🚀 优势对比

### 旧方案（服务器构建）
```
每次部署：
  - GitHub Actions: 类型检查 (~2分钟)
  - 服务器: 构建 3 个镜像 (~10分钟)
  - 资源消耗: 服务器 CPU 100%，RAM 1GB+
  - 网络消耗: 下载依赖
```

### 新方案（智能检测 + GitHub 构建）
```
只改 bot 代码：
  - GitHub Actions: 检测 + 检查 + 构建 bot (~3分钟)
  - 服务器: 拉取 bot 镜像 (~30秒)
  - 资源消耗: 服务器几乎无消耗
  - 网络消耗: 拉取 ~50MB 镜像

只改文档：
  - GitHub Actions: 检测变更，跳过所有构建
  - 服务器: 无操作
  - 资源消耗: 零
```

**预期节省：**
- 构建时间: 减少 60%+
- 服务器资源: 减少 90%+
- 网络带宽: 减少 70%+

## 🔧 首次部署设置

### 1. 创建 GitHub Personal Access Token (PAT)

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 名称：`GHCR Read Access for QQ Bot`
4. 权限：勾选 `read:packages`
5. 生成并复制 token（格式: `ghp_xxxx`）

### 2. 服务器配置

```bash
# SSH 到服务器
ssh ubuntu@your-server

# 进入项目目录
cd /home/ubuntu/qq-bot

# 创建 .env 文件
cp .env.example .env
nano .env
```

填入以下必需的环境变量：
```bash
GHCR_TOKEN=ghp_your_token_here
GITHUB_REPOSITORY_OWNER=joyehuang
```

### 3. 首次手动拉取镜像

**方法1：使用部署脚本（推荐）**
```bash
# 设置环境变量
export UPDATE_BOT=true
export UPDATE_ADMIN_SERVER=true
export UPDATE_ADMIN_WEB=true
export GITHUB_REPOSITORY_OWNER=joyehuang

# 执行部署脚本
./deploy-qqbot.sh
```

**方法2：手动拉取**
```bash
# 加载环境变量
source .env

# 登录 GHCR
echo $GHCR_TOKEN | docker login ghcr.io -u joyehuang --password-stdin

# 拉取镜像
export GITHUB_REPOSITORY_OWNER=joyehuang
docker compose pull

# 启动服务
docker compose up -d
```

### 4. 验证部署

```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f bot
docker compose logs -f admin-api
docker compose logs -f admin-web
```

## 📝 日常使用

### 场景1：修改 Bot 代码

```bash
# 本地修改代码
vim src/index.ts

# 提交并推送
git add src/index.ts
git commit -m "feat(bot): 新增某功能"
git push
```

**自动执行：**
1. ✅ 检测到 `src/**` 变更
2. ✅ 类型检查 Bot
3. ✅ 构建 Bot 镜像
4. ✅ 推送到 GHCR
5. ✅ 服务器拉取并重启 bot
6. ⏭️ 跳过 admin-server 和 admin-web

### 场景2：修改 Admin Web

```bash
# 本地修改代码
vim admin/web/src/views/Dashboard.vue

# 提交并推送
git add admin/web/
git commit -m "feat(admin): 优化仪表盘"
git push
```

**自动执行：**
1. ✅ 检测到 `admin/web/**` 变更
2. ✅ 类型检查 Admin Web
3. ✅ 构建 Admin Web 镜像
4. ✅ 服务器拉取并重启 admin-web
5. ⏭️ 跳过 bot 和 admin-server

### 场景3：修改 Prisma Schema

```bash
# 修改数据库 schema
vim prisma/schema.prisma

# 提交并推送
git add prisma/
git commit -m "feat(db): 新增某字段"
git push
```

**自动执行：**
1. ✅ 检测到 `prisma/**` 变更
2. ✅ 类型检查 Bot + Admin Server
3. ✅ 构建 Bot + Admin Server 镜像
4. ✅ 执行数据库迁移
5. ✅ 服务器重启 bot + admin-api
6. ⏭️ 跳过 admin-web（前端不依赖 Prisma）

### 场景4：只修改文档

```bash
# 修改文档
vim README.md

# 提交并推送
git add README.md
git commit -m "docs: 更新文档"
git push
```

**自动执行：**
1. ✅ 检测到无代码变更
2. ⏭️ 跳过所有构建和部署
3. 🎉 节省时间和资源

## 🔍 故障排查

### 问题1：服务器拉取镜像失败

```bash
Error: pull access denied for ghcr.io/joyehuang/qq-bot
```

**解决：**
```bash
# 检查 .env 文件
cat .env | grep GHCR_TOKEN

# 重新登录
echo $GHCR_TOKEN | docker login ghcr.io -u joyehuang --password-stdin

# 手动拉取测试
docker pull ghcr.io/joyehuang/qq-bot:latest
```

### 问题2：GitHub Actions 构建失败

**常见原因：**
- TypeScript 类型错误
- Dockerfile 配置错误
- 依赖安装失败

**解决：**
1. 查看 GitHub Actions 日志
2. 本地运行类型检查：`npx tsc --noEmit`
3. 本地构建镜像：`docker build -t test .`

### 问题3：部署脚本报错

```bash
⚠️ bot 镜像拉取失败，使用现有镜像
```

**这是正常的！** 如果拉取失败，脚本会使用现有镜像继续运行，不会中断服务。

### 问题4：镜像是旧版本

```bash
# 手动清除缓存并拉取
docker compose down
docker system prune -a -f
docker compose pull
docker compose up -d
```

## 📊 监控和日志

### 查看 GitHub Actions 运行状态
https://github.com/joyehuang/qq-bot/actions

### 查看镜像列表
https://github.com/joyehuang?tab=packages

### 服务器端日志
```bash
# 实时日志
docker compose logs -f

# 特定服务
docker compose logs -f bot
docker compose logs -f admin-api

# 最近 100 行
docker compose logs --tail 100
```

## 🎓 最佳实践

1. **频繁提交** - 小步快跑，每个功能单独提交
2. **清晰的提交信息** - 使用 Conventional Commits 规范
3. **本地测试** - 推送前先本地运行类型检查
4. **查看 Actions** - 每次 push 后检查 Actions 是否成功
5. **定期清理** - 服务器定期清理旧镜像释放空间

## 📖 相关文档

- GitHub Actions: https://docs.github.com/en/actions
- GitHub Packages: https://docs.github.com/en/packages
- Docker Compose: https://docs.docker.com/compose/
- Prisma: https://www.prisma.io/docs/
