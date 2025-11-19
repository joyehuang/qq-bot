# QQ 打卡机器人

一个基于 NapCat 的 QQ 群打卡机器人，帮助群成员记录和追踪学习、运动等活动时长。

## 功能特性

### 核心功能
- **打卡记录** - 支持多种时长格式（分钟、小时、天等）
- **贷款打卡** - 预支未来打卡时长，产生负债
- **打卡统计** - 查看个人打卡历史和累计时间（含 AI 分析）
- **周报** - 查看本周打卡数据和 AI 总结

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

- **运行时**: Node.js + TypeScript
- **QQ 协议**: NapCat (OneBot 11)
- **数据库**: SQLite + Prisma ORM
- **通信**: WebSocket
- **AI**: SiliconFlow API (Qwen)
- **部署**: Docker Compose

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
│   └── index.ts          # 主程序
├── prisma/
│   ├── schema.prisma     # 数据库模型
│   └── migrations/       # 数据库迁移
├── napcat/
│   └── config/           # NapCat 配置
├── docker-compose.yml    # Docker 配置
├── COMMANDS.md           # 完整指令文档
├── CLAUDE.md             # 开发规范
└── README.md
```

## 详细文档

- [完整指令文档](./COMMANDS.md) - 所有命令的详细说明

## License

MIT
