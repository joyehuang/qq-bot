# QQ 打卡机器人 × Hermes Agent 深度整合 PRD

> 本文档是 QQ 打卡机器人改造项目的总体规划，包含已完成的工作、当前待做的任务、以及长期愿景。任何接手本项目的开发者（包括 Claude Code）应先阅读本文档。

---

## 1. 项目背景与愿景

### 1.1 是什么

本项目是一个基于 **NapCat (OneBot 11)** 的 QQ 群打卡机器人，帮助群成员记录学习/运动/工作等活动时长，提供打卡统计、排行榜、成就系统、AI 智能分类与鼓励、群头衔等功能。

原仓库：`git@github.com:joyehuang/qq-bot.git`
项目路径：`/mnt/hermes-data/community/projects/qq-bot/`

### 1.2 为什么要改造

用户的服务器上运行着 **Hermes Agent**（一个开源的 AI Agent 框架，支持多平台、定时任务、记忆、profile 隔离等）。原 QQ Bot 的架构比较简单：

- AI 调用通过 **SiliconFlow API** 远程请求，没有利用本地 Hermes Agent 的能力
- 定时任务通过 Node.js `setInterval` 实现，不可靠
- 没有和 Hermes 的记忆系统整合
- 管理后台过于冗余（有独立的前端 Vue + 后端 Express）

**核心目标**：让 QQ Bot 成为 Hermes Agent 的一个「群外脑」，深度利用 Hermes 的 AI 能力、定时任务、记忆系统，而不是独立运行的简单脚本。

### 1.3 服务器环境

- **OS**: Ubuntu (Server)
- **Node.js**: 有 `npm`，但 `bun` 在 `/home/ubuntu/.bun/bin/bun` （需要手动加 PATH）
- **Hermes Agent**: 已安装在 `~/.hermes/` ，配置文件在 `~/.hermes/config.yaml`
- **community profile**: 已创建在 `~/.hermes/profiles/community/`，模型锁定 `anthropic/claude-opus-4-7`
- **Caddy**: 已配置反代，用户的个人域名 `joyehuang.me` 可用于对外暴露服务

### 1.4 安全隔离要求

QQ Bot 会被拉入群里供所有成员使用，服务器上还有其他敏感项目。因此：
- Bot 项目和数据存放在 `/mnt/hermes-data/community/`（独立硬盘分区）
- community profile 的 `cwd` 已限制为 `/mnt/hermes-data/community/projects/qq-bot`
- AI 调用默认使用 `-p community` 确保走正确的配置

---

## 2. 长期愿景（远期目标）

### 2.1 核心愿景

> 让 QQ 打卡群成为一个「AI 驱动的学习共同体」。

Bot 不再只是一个「打卡工具」，而是群里的智能助手：

1. **AI 打卡伙伴**：根据群友的打卡历史、目标、偏好，提供真正个性化的分析与鼓励
2. **定时智能交互**：每日打卡督促、断签调侤、头衔更新等全部交给 Hermes Cron 调度
3. **跨 Profile 记忆共享**：用户在 Personal profile 里的学习笔记、面试经验、博客更新，Bot 可以在群里分享
4. **自然语言交互**：群友可以像和朋友聊天一样与 Bot 交流，而不是只能用指令式命令

### 2.2 架构设想

```
┌─────────────────────────────────────────────────────┐
│                    Hermes Agent (Gateway)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  CLI Mode    │  │  Cron Jobs   │  │  QQ Bot      │  │
│  │  (hermes chat) │  │  (schedules) │  │  (qqbot plat) │  │
│  └───┼─────────────┘  └─────────────┘  └─────────────┘  │
│       │                 │                 │                │
│       └──────────────┼───────────────┼───────────────┘                │
│                           │                 │                               │
│                    ┌──────┴───────────────┐                              │
│                    │   Profile: community    │                              │
│                    │   Model: claude-opus-4  │                              │
│                    │   Memory: SQLite DB     │                              │
│                    │   CWD: /mnt/hermes-data/│                              │
│                    │        community/...    │                              │
│                    └─────────────────────────┘                              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│               QQ Bot Node.js Process                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  NapCat WebSocket ←→ OneBot 11 ←→ QQ 群                    │ │
│  │  src/index.ts (Bot 主程序)                                │ │
│  │   │                                                      │ │
│  │   └→ 打卡/贷款/撤销/统计/榜单/成就/...                    │ │
│  │       │                                                  │ │
│  │       └→ callHermesAgent() → hermes chat -p community        │ │
│  │           (异步调用本地 Hermes CLI)                      │ │
│  │                                                      │ │
│  │  Prisma ORM ←→ SQLite (prisma/dev.db)                     │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 2.3 长期功能蓝图

| 阶段 | 功能 | 说明 |
|------|------|------|
| 已完成 | 核心打卡、贷款打卡、撤销、统计、榜单、成就、头衔 | Bot 核心业务逻辑 |
| 已完成 | AI 分类、鼓励、分析、周报 | 调用本地 Hermes CLI |
| 待改造 | 定时任务（督促、断签调侤、头衔更新） | 从 `setInterval` 迁移到 Hermes Cron |
| 待讨论 | 管理后台 | 简化或删除 Vue 前端，可能通过 Caddy 反代暴露简单页面 |
| 待设计 | 用户记忆升级 | 让 Hermes 记住每位群友的偏好、目标、打卡模式 |
| 远期 | 跨 Profile 学习分享 | 从 Personal profile 读取当天学习内容，在群里分享 |
| 远期 | 自然语言交互 | 群友随意聊天式交互，Bot 理解意图并执行 |

---

## 3. 已完成工作（历史上下文）

以下工作均已完成并推送到 `origin/main`，任何新开发都是基于这些已完成的基础。

### 3.1 Git 提交历史

```
a2e7161 refactor: replace SiliconFlow API with Hermes Agent CLI
cafb8a9 cleanup: remove github integration, announce command, update help message
231d404 cleanup: remove study system and 'checkin for others' feature
```

### 3.2 具体改动

#### 3.2.1 创建项目基础环境

- 克隆仓库到 `/mnt/hermes-data/community/projects/qq-bot/`
- 创建 Hermes **community profile**
  - 模型: `anthropic/claude-opus-4-7` (提供商: anthropic)
  - 终端 CWD: `/mnt/hermes-data/community/projects/qq-bot`
  - 禁用与群聊无关的 toolsets（spotify, discord, feishu 等）
- 初始化全新 SQLite 数据库（`prisma migrate dev --name init`）
  - 旧数据库已确认丢失，用户决定放弃，从零开始

#### 3.2.2 功能删除（第一阶段）

| 删除内容 | 行数变化 | 说明 |
|---------|---------|------|
| MiniMind 学习系统（学习计划、进度、督促、教学） | -944 行 | 包含 `StudyProject`、`StudyPlan`、`StudyCheckpoint` 业务逻辑 |
| 为他人打卡 | -约100 行 | `@某人 打卡 2小时 xxx` 功能及其帮助文案 |
| GitHub 集成 | -约50 行 | `今日提交`、`今日代码量` 等命令 |
| Announce 功能 | -约50 行 | `/announce 消息` 群公告发布 |
| 更新 Help 文案 | -约100 行 | 移除学习系统相关的帮助内容 |

**代码缩减**：4493 行 → ~3180 行（约 1300 行删除）

#### 3.2.3 AI 调用迁移（第二阶段）

**前期状态**：
- `AI_API_URL` 指向 SiliconFlow
- `AI_API_KEY` 存储在 `.env`
- `AI_MODEL` 设为 qwen 模型
- 所有 AI 调用都走 HTTP fetch 到远程 API

**改造后状态**：
- 删除 `AI_API_URL`、`AI_API_KEY`、`AI_MODEL` 常量
- 新增 `callHermesAgent()` 函数：通过 `child_process.execSync` 调用 `hermes chat -q "..." -Q`
- `callAI()` 改为 `callHermesAgent()` 的包装器
- 所有上层功能保持原签名不变

**Hermes CLI 输出解析**：
```
session_id: 20260504_025107_c6200a
I'm online and ready. What can I help you with?
```
- 第一行是 `session_id: xxx`，需要跳过
- 第二行起是实际 AI 回复

#### 3.2.4 保留的核心模块

| 模块 | 状态 | 说明 |
|------|------|------|
| 打卡系统 | 保留 | `/打卡 时长 内容` 、贷款打卡、撤销 |
| AI 智能 | 保留 | 分类、鼓励、分析、周报，但已切换到 Hermes CLI |
| 榜单 | 保留 | 今日/本周/总榜 |
| 成就 | 保留 | 10 种可解锁成就 |
| 群头衔 | 保留 | 排行榜前列 + 成就解锁者自动设置（已知 QQ API bug 待查） |
| 打卡督促 | 保留 | 定时提醒管理员打卡（待迁移到 Hermes Cron） |
| 断签调侤/警告 | 保留 | 帮助连续打卡用户避免断签（待迁移到 Hermes Cron） |
| 管理员功能 | 保留 | 打卡记录管理、用户管理、群设置 |
| 互动功能 | 保留 | 身份询问、打招呼、功能建议 |
| Web 管理后台 | 待讨论 | 现有 Vue 3 + Express + JWT 后台，可能简化 |

---

## 4. 当前待做任务（本轮重点）

### 4.1 任务：修复 callHermesAgent 安全隐患与阻塞问题

#### 4.1.1 问题描述

当前 `callHermesAgent` 实现在 `src/index.ts` 第 76-100 行：

```typescript
async function callHermesAgent(
  systemPrompt: string,
  userPrompt: string,
  model?: string
): Promise<string | null> {
  const { execSync } = require('child_process');
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const modelFlag = model ? `-m ${model}` : '';
    const result = execSync(
      `hermes chat -q ${JSON.stringify(fullPrompt)} -Q ${modelFlag}`,
      { encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    const lines = result.trim().split('\n');
    if (lines.length > 1 && lines[0].startsWith('session_id:')) {
      return lines.slice(1).join('\n').trim();
    }
    return result.trim();
  } catch (error) {
    console.error('Hermes Agent 调用失败:', error);
    return null;
  }
}
```

存在 **3 个严重问题**：

1. **阻塞事件循环**：`execSync` 会完全阻塞 Node.js 事件循环。AI 调用期间（最长 30 秒）Bot 无法响应任何其他消息。如果群里多人同时使用 AI 功能，Bot 完全卡死。
2. **Shell 注入风险**：`JSON.stringify()` 不会转义 `$`、反引号 `` ` ``、感叹号 `!` 等 shell 元字符。用户发送恶意打卡内容时可能触发命令注入。
3. **未指定 profile**：调用 `hermes chat` 时未使用 `-p community`，可能使用错误的模型或配置。

#### 4.1.2 改造要求

**必须使用**：`child_process.execFile` 或 `spawn` （非阻塞异步）+ 参数数组（无 shell 解析）+ 默认 `-p community`。

**接口保持不变**：
- `callAI(systemPrompt, userPrompt)` — 保持原签名
- `classifyCheckin(text)` — 保持原签名
- `generateAIEncouragement(...)` — 保持原签名
- `generateAIAnalysis(...)` — 保持原签名
- `generateWeeklySummary(...)` — 保持原签名

上层调用完全不需要修改。

**推荐实现**（供参考，可根据实际情况调整）：

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// 保持原有签名，作为包装器
async function callHermesAgent(
  systemPrompt: string,
  userPrompt: string,
  model?: string
): Promise<string | null> {
  const result = await callHermesAgentV2({
    systemPrompt,
    userPrompt,
    model,
    profile: 'community',
    timeoutMs: 30000,
  });

  if (!result.success) {
    console.error('[HermesAgent] 调用失败:', result.error);
    return null;
  }
  return result.content;
}

// 新增内部实现
interface HermesAgentOptions {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  profile?: string;
  timeoutMs?: number;
}

interface HermesAgentResult {
  success: boolean;
  content: string | null;
  error?: string;
  sessionId?: string;
}

async function callHermesAgentV2(options: HermesAgentOptions): Promise<HermesAgentResult> {
  const { systemPrompt, userPrompt, model, profile = 'community', timeoutMs = 30000 } = options;
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const args = ['chat', '-q', fullPrompt, '-Q', '-p', profile];
  if (model) {
    args.push('-m', model);
  }

  try {
    const { stdout, stderr } = await execFileAsync('hermes', args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });

    if (stderr) {
      console.warn('[HermesAgent] stderr:', stderr);
    }

    const lines = stdout.trim().split('\n');
    let sessionId: string | undefined;
    let contentStart = 0;

    if (lines.length > 0 && lines[0].startsWith('session_id:')) {
      sessionId = lines[0].replace('session_id:', '').trim();
      contentStart = 1;
    }

    const content = lines.slice(contentStart).join('\n').trim();

    return { success: true, content: content || null, sessionId };
  } catch (error: any) {
    let errorMsg = '未知错误';
    if (error.killed && error.signal === 'SIGTERM') {
      errorMsg = 'Hermes Agent 调用超时（30秒）';
    } else if (error.code === 'ENOENT') {
      errorMsg = 'hermes 命令未找到，请检查 Hermes Agent 是否已安装';
    } else if (error.stderr) {
      errorMsg = `Hermes Agent 错误: ${error.stderr}`;
    } else if (error.message) {
      errorMsg = error.message;
    }
    return { success: false, content: null, error: errorMsg };
  }
}
```

#### 4.1.3 验收标准

- [ ] `npx tsc --noEmit` 编译通过，无类型错误
- [ ] `callHermesAgent` 不再使用 `execSync` 或 `exec`
- [ ] `callHermesAgent` 使用 `execFile` 或 `spawn` + 参数数组
- [ ] 默认携带 `-p community` 参数
- [ ] 包含特殊字符（`$`, `` ` ``, `!`, `;`, `|`）的 prompt 不会导致 shell 错误或注入
- [ ] 超时场景返回 `null` 并打印超时日志
- [ ] `hermes` 命令不存在时返回清晰的错误日志
- [ ] 上层调用 `callAI`、`classifyCheckin` 等 **无需任何修改**
- [ ] 并发消息场景下 Bot 不会阻塞
- [ ] 改造完成后 `git add -A && git commit -m "fix(callHermesAgent): async execFile, shell-injection protection, community profile" && git push origin main`

---

## 5. 后续待做任务（未来轮次）

### 5.1 定时任务迁移到 Hermes Cron（高优先级）

当前代码中仍有基于 `setInterval` 的定时任务：
- 每日打卡督促
- 断签警告/调侤
- 头衔更新

需要设计并实现 Hermes Cronjob 替代方案，通过 `hermes cron create` 创建定时任务。

### 5.2 管理后台简化（待讨论）

当前管理后台：Vue 3 + Express + JWT + Pinia + ECharts，独立 Docker 服务。

用户倾向保留但简化，可能方案：
- 删除 Vue 前端，改用简单的 HTML/JS 静态页面
- 通过 Caddy 反代到子域名（如 `bot-admin.joyehuang.me`）
- 或完全删除，管理功能通过 QQ 命令实现

### 5.3 用户记忆升级（待设计）

利用 Hermes 的记忆系统记住每位群友的：
- AI 回复风格偏好
- 每日目标和进度
- 打卡模式与习惯
- 历史交互上下文

### 5.4 Docker 部署更新

更新 `docker-compose.yml`：
- 确保管理后台端口不暴露到公网
- 数据库挂载到 `/mnt/hermes-data/community/projects/qq-bot/prisma/`
- 确保可以访问 `hermes` 命令

### 5.5 群头衔 bug 排查

已知问题：QQ 机器人无法正确设置群头衔，需要调查 OneBot API 或 NapCat 配置。

### 5.6 远期：跨 Profile 学习分享

从 Hermes 其他 profile（如 Personal）的记忆或消息中提取当天学习内容（面试经验、新博客、项目进展），自动在群里分享。

可能通过 `joyehuang.me` 网站的 hook 触发。

---

## 6. 技术上下文参考

### 6.1 项目结构

```
qq-bot/
├── src/
│   ├── index.ts              # 主程序（约 3200 行，单体式）
│   ├── config/
│   │   └── aiStyles.ts       # 6 种 AI 回复风格模板
│   └── generated/prisma/client/  # Prisma 生成的 ORM 客户端
├── prisma/
│   ├── schema.prisma          # 数据库 schema（SQLite）
│   ├── migrations/
│   └── dev.db                  # 数据库文件（全新，旧数据已丢失）
├── napcat/                    # NapCat 配置
├── admin/                     # Web 管理后台（Vue 3 + Express）
├── .env                       # 环境变量
├── package.json               # 依赖
├── docker-compose.yml         # Docker 部署
├── COMMANDS.md                # 命令文档
└── README.md                  # 项目说明
```

### 6.2 数据库 Schema

核心表：`User`、`Checkin`、`Achievement`、`Suggestion`

学习系统表（已删除业务逻辑，但 schema 仍在）：`StudyProject`、`StudyPlan`、`StudyCheckpoint`

关键字段：
- `User.qqNumber` — QQ 号
- `User.aiStyle` — AI 风格（encourage/strict/funny/professional/ridicule/teacher）
- `Checkin.duration` — 时长（分钟）
- `Checkin.category/subcategory` — AI 分类结果
- `Checkin.isLoan` — 是否贷款打卡

### 6.3 Hermes Agent CLI 调用方式

```bash
# 基本调用
hermes chat -q "<prompt>" -Q

# 使用 community profile
hermes -p community chat -q "<prompt>" -Q

# 指定模型
hermes chat -q "<prompt>" -Q -m anthropic/claude-sonnet-4
```

**输出格式**：
```
session_id: <uuid>
<AI 回复内容...>
```

### 6.4 开发规范

- 每完成一个改造部分，必须 `git add -A && git commit -m "..." && git push origin main`
- 直接在 `main` 分支开发，不需要单独开分支
- TypeScript `strict` 模式，编译必须通过 `npx tsc --noEmit`
- 不引入新依赖（优先使用 Node.js 内置模块）
- 敏感信息不硬编码，通过 `.env` 或环境变量传入

### 6.5 关键文件路径

| 路径 | 说明 |
|------|------|
| `/mnt/hermes-data/community/projects/qq-bot/src/index.ts` | 主程序 |
| `/mnt/hermes-data/community/projects/qq-bot/prisma/schema.prisma` | 数据库 schema |
| `/mnt/hermes-data/community/projects/qq-bot/prisma/dev.db` | 数据库 |
| `~/.hermes/config.yaml` | Hermes 默认配置 |
| `~/.hermes/profiles/community/config.yaml` | community profile 配置 |
| `~/.hermes/.env` | Hermes API 密钥 |

---

## 7. 附录

### 7.1 已知问题清单

| 问题 | 严重级 | 状态 | 说明 |
|------|--------|------|------|
| callHermesAgent 阻塞/注入 | 高 | 待修复 | 本轮任务 |
| 定时任务仍用 setInterval | 中 | 待迁移 | 需改造为 Hermes Cron |
| 群头衔设置失败 | 中 | 待排查 | QQ API 问题 |
| 成就系统时区问题 | 低 | 待处理 | 打卡日期边界判断不准 |
| 管理后台简化 | 低 | 待讨论 | 用户倾向保畑简化 |
| 学习系统表仍在 schema | 低 | 待清理 | 已删除业务逻辑，可删除表定义 |

### 7.2 联系人

- 项目拥有者：joye (De-Shiou Huang)
- GitHub：github.com/joyehuang
- 网站：joyehuang.me
- 当前实习公司：Tezign（上海）、fAIshion.ai / Goshu Tech

---

> 本 PRD 作为 QQ Bot 改造项目的总体指南。当前轮次重点是 **第 4 章节（修复 callHermesAgent）**，完成后将进入定时任务迁移阶段。
