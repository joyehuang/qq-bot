# QQ 打卡机器人

一个基于 NapCat 的 QQ 群打卡机器人，帮助群成员记录和追踪学习、运动等活动时长。

## 功能特性

### 核心功能
- **打卡记录** - 支持多种时长格式（分钟、小时、天等）
- **贷款打卡** - 预支未来打卡时长，产生负债
- **打卡统计** - 查看个人打卡历史和累计时间（含 AI 分析）
- **周报** - 查看本周打卡数据和 AI 总结
- **年度报告** - 查看年度总结和 AI 深度分析（含自动推送）

### 社交功能
- **排行榜** - 今日/本周/总排行榜
- **群统计** - 查看群整体打卡数据
- **成就系统** - 10 种可解锁成就

### 个性化
- **每日目标** - 设置打卡目标，显示进度条
- **连续打卡** - 自动追踪连续打卡天数
- **AI 分析** - 基于打卡历史的个性化洞察

### 其他
- **新人引导** - 注册命令帮助新用户上手
- **管理员系统** - 多级权限管理
- **打卡督促** - 定时提醒督促打卡
- **GitHub 集成** - 查看今日代码提交

## 技术栈

### 机器人主程序
- **运行时**: Node.js + TypeScript
- **QQ 协议**: NapCat (OneBot 11)
- **数据库**: SQLite + Prisma ORM
- **通信**: WebSocket
- **AI**: SiliconFlow API (Qwen)
- **部署**: Docker Compose

### 管理后台
- **后端**: Express.js + TypeScript
- **前端**: Vue 3 + TypeScript + Element Plus
- **状态管理**: Pinia
- **图表**: ECharts
- **认证**: JWT
- **部署**: Docker + Nginx

## 快速开始

### Docker 部署（推荐）

1. 克隆项目并配置环境变量：

```bash
git clone https://github.com/joyehuang/qq-bot.git
cd qq-bot
cp .env.example .env
# 编辑 .env 文件填入配置
```

2. 启动服务：

```bash
docker compose up -d
```

3. 扫码登录 NapCat（首次启动）

### 本地开发

1. 安装依赖：

```bash
npm install
```

2. 配置环境变量（创建 `.env` 文件）：

```env
DATABASE_URL="file:./dev.db"
ADMIN_QQ="你的QQ号"
BOT_QQ="机器人QQ号"

# 打卡督促配置
REMINDER_GROUP_ID="群号"
REMINDER_HOUR="19"
REMINDER_MINUTE="0"
REMINDER_TIMEZONE="Australia/Melbourne"

# GitHub 配置（可选）
GITHUB_USERNAME="你的GitHub用户名"
GITHUB_TOKEN="ghp_xxxx"

# AI 配置（可选，用于个性化分析）
AI_API_KEY="your-siliconflow-api-key"
```

3. 初始化数据库：

```bash
npx prisma migrate dev
```

4. 启动机器人：

```bash
npx ts-node src/index.ts
```

## 使用方法

在群里 @机器人 后发送命令，私聊可直接发送。

支持的 @ 方式：
- QQ 原生 @（从成员列表选择）
- 手动输入 `@JoyeBot`、`@joye`、`@打卡` 等

### 常用命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `我想打卡` | 新人注册 | `我想打卡` |
| `打卡 [时长] [内容]` | 记录打卡 | `打卡 30分钟 学习TypeScript` |
| `打卡 贷款 [时长] [内容]` | 贷款打卡 | `打卡 贷款 1小时 学习` |
| `打卡记录` | 查看统计（含 AI 分析） | `打卡记录` |
| `周报` | 查看本周报告 | `周报` |
| `年报` / `年度报告` | 查看年度报告（含 AI 深度分析） | `年报` |
| `设置目标 [时长]` | 设置每日目标 | `设置目标 2小时` |
| `负债` | 查看贷款负债 | `负债` |
| `今日排行` / `周榜` / `总榜` | 查看排行榜 | `周榜` |
| `群统计` | 查看群数据 | `群统计` |
| `成就` | 查看成就 | `成就` |
| `帮助` | 查看帮助 | `帮助` |

### 支持的时长格式

- 分钟：`30分钟`、`45m`、`30分`、`60min`
- 小时：`1小时`、`2h`、`1.5时`、`3hr`
- 复合：`1小时30分钟`、`2h30m`
- 天数：`1天`、`2d`
- 秒数：`3600秒`（自动转分钟）
- 纯数字：`30`（默认为分钟）

## 项目结构

```
qq-bot/
├── src/
│   └── index.ts          # 机器人主程序
├── admin/                # 管理后台
│   ├── server/           # 后端 API
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/              # 前端界面
│       ├── src/
│       ├── Dockerfile
│       ├── nginx.conf
│       └── package.json
├── prisma/
│   ├── schema.prisma     # 数据库模型
│   └── migrations/       # 数据库迁移
├── napcat/
│   └── config/           # NapCat 配置
├── docker-compose.yml    # Docker 配置
├── deploy-qqbot.sh       # Bot 部署脚本
├── deploy-admin.sh       # 管理后台部署脚本
├── COMMANDS.md           # 完整指令文档
├── CLAUDE.md             # 开发规范
└── README.md
```

## 管理后台

本项目包含一个 Web 管理后台，用于查看和管理打卡数据。

### 功能特性

- **数据概览** - 总用户数、总打卡数、总时长、今日活跃等统计
- **打卡趋势** - 可视化打卡趋势图表（日/周/月）
- **分类统计** - 打卡分类占比饼图
- **排行榜** - 本周打卡排行榜
- **打卡记录管理** - 查看、搜索、筛选、删除打卡记录，支持导出 CSV
- **用户管理** - 查看用户列表和详情，包括打卡统计和成就
- **暗黑模式** - 支持明/暗主题切换
- **响应式设计** - 支持移动端访问

### 快速开始

#### 开发环境

1. 启动后端 API（端口 3001）：

```bash
cd admin/server
npm install
npm run dev
```

2. 启动前端（端口 5173/5174）：

```bash
cd admin/web
npm install
npm run dev
```

3. 访问 http://localhost:5173，使用以下凭据登录：
   - 用户名：`admin`
   - 密码：见 `.env` 文件中的 `ADMIN_PASSWORD`

#### Docker 部署

1. 确保 `.env` 文件中配置了管理后台环境变量：

```env
# 管理后台配置
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret-key
ADMIN_API_PORT=3001
```

2. 构建并启动管理后台服务：

```bash
docker compose up -d --build admin-api admin-web
```

3. 访问管理后台：
   - 前端：http://localhost:8080
   - API：http://localhost:3001/health

#### 服务器部署

在服务器上运行部署脚本：

```bash
./deploy-admin.sh
```

该脚本会自动：
- 拉取最新代码
- 构建 Docker 镜像
- 执行数据库迁移
- 重启服务
- 清理资源

### API 文档

管理后台 API 提供以下端点：

- **认证**: `POST /api/auth/login`, `POST /api/auth/verify`
- **打卡记录**: `GET /api/checkins`, `GET /api/checkins/:id`, `DELETE /api/checkins/:id`, `GET /api/checkins/export/csv`
- **用户**: `GET /api/users`, `GET /api/users/:id`, `GET /api/users/:id/checkins`
- **统计**: `GET /api/stats/overview`, `GET /api/stats/trend`, `GET /api/stats/category`, `GET /api/stats/leaderboard`

详见 [ADMIN_DEV_PLAN.md](./ADMIN_DEV_PLAN.md)

### 技术架构

- **前端**: Vue 3 + TypeScript + Element Plus + ECharts
- **后端**: Express.js + TypeScript + Prisma
- **认证**: JWT Bearer Token
- **数据库**: 共享 Bot 主程序的 SQLite 数据库
- **容器化**: Docker 多阶段构建 + Nginx

## 详细文档

- [完整指令文档](./COMMANDS.md) - 所有命令的详细说明
- [管理后台开发计划](./ADMIN_DEV_PLAN.md) - 管理后台技术文档
- [管理后台开发进度](./ADMIN_PROGRESS.md) - 开发进度追踪

## License

MIT
