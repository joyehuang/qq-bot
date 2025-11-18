import "dotenv/config";
import WebSocket from 'ws';
import { PrismaClient, Checkin, Suggestion } from './generated/prisma/client';

const WS_URL = 'ws://localhost:6100';
const prisma = new PrismaClient();

// 超级管理员QQ号（从环境变量读取，不可被删除）
const SUPER_ADMIN_QQ = process.env.ADMIN_QQ || '';

// 督促打卡配置
const REMINDER_GROUP_ID = process.env.REMINDER_GROUP_ID || ''; // 督促消息发送的群号
const REMINDER_HOUR = parseInt(process.env.REMINDER_HOUR || '19'); // 督促时间（小时，24小时制）
const REMINDER_MINUTE = parseInt(process.env.REMINDER_MINUTE || '0'); // 督促时间（分钟）
const REMINDER_TIMEZONE = process.env.REMINDER_TIMEZONE || 'Australia/Melbourne'; // 时区

// GitHub 配置
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // 用于访问私有仓库

// 管理员列表（包含超级管理员和动态添加的管理员）
const adminList: Set<string> = new Set();
if (SUPER_ADMIN_QQ) {
  adminList.add(SUPER_ADMIN_QQ);
}

// 机器人状态
let botEnabled = true;

// 定时器引用
let reminderTimer: NodeJS.Timeout | null = null;

// 获取 GitHub 今日提交数量
async function getGitHubTodayCommits(username: string): Promise<{ count: number; repos: string[] }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().split('T')[0];

  try {
    // 获取用户今天的事件
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'QQ-Bot'
    };

    // 如果有 Token，添加认证头（可以访问私有仓库）
    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const response = await fetch(`https://api.github.com/users/${username}/events?per_page=100`, {
      headers
    });

    if (!response.ok) {
      throw new Error(`GitHub API 错误: ${response.status}`);
    }

    const events = await response.json() as any[];

    let commitCount = 0;
    const repos = new Set<string>();

    for (const event of events) {
      if (event.type === 'PushEvent') {
        const eventDate = new Date(event.created_at).toISOString().split('T')[0];
        if (eventDate === todayISO) {
          const commits = event.payload?.commits?.length || 0;
          commitCount += commits;
          if (event.repo?.name) {
            repos.add(event.repo.name.split('/')[1] || event.repo.name);
          }
        }
      }
    }

    return { count: commitCount, repos: Array.from(repos) };
  } catch (error) {
    console.error('获取 GitHub 数据失败:', error);
    throw error;
  }
}

interface Message {
  post_type: string;
  message_type?: string;
  user_id?: number;
  group_id?: number;
  raw_message?: string;
  message_id?: number;
  sender?: {
    nickname?: string;
    card?: string; // 群名片
  };
}

// 机器人信息
const BOT_INFO = {
  name: '打卡小助手',
  version: '1.0.0',
  description: '一个帮助大家记录和追踪学习、运动等活动的群打卡机器人',
  commands: [
    '📝 打卡 [时长] [内容] - 记录打卡',
    '📊 打卡记录 - 查看统计',
    '💡 建议 [内容] - 提交功能建议',
    '❓ 帮助 - 查看所有命令'
  ]
};

// 模糊匹配关键词组
const INTRO_PATTERNS = {
  identity: ['你是谁', '你叫什么', '你是什么', '你的名字', '介绍一下', '自我介绍', '是什么机器人', '什么bot', '你是啥'],
  ability: ['你能做什么', '你会什么', '你可以做什么', '有什么功能', '能干什么', '会干什么', '有啥功能', '能干啥', '怎么用', '如何使用', '使用方法', '使用说明'],
  greeting: ['你好', '在吗', '在不在', 'hello', 'hi', '嗨', '哈喽', '早上好', '下午好', '晚上好']
};

// 开关机关键词
const POWER_PATTERNS = {
  shutdown: ['闭嘴', '关机', '不准说话', '安静', '别说了', '休息', '下班', '关闭', '停止', '别吵'],
  startup: ['开机', '说话', '醒醒', '起来', '上班', '开启', '启动', '工作', '唤醒', '醒来']
};

// 检查消息是否匹配某个模式组
function matchPattern(message: string, patterns: string[]): boolean {
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()));
}

// 处理自我介绍相关的问题
function handleIntroduction(ws: WebSocket, event: Message, message: string): boolean {
  // 检查身份询问
  if (matchPattern(message, INTRO_PATTERNS.identity)) {
    sendReply(
      ws,
      event,
      `🤖 你好！我是 ${BOT_INFO.name} v${BOT_INFO.version}\n\n` +
      `${BOT_INFO.description}\n\n` +
      `🎯 主要功能:\n${BOT_INFO.commands.join('\n')}\n\n` +
      `发送"帮助"查看详细使用方法～`
    );
    return true;
  }

  // 检查能力询问
  if (matchPattern(message, INTRO_PATTERNS.ability)) {
    sendReply(
      ws,
      event,
      `🎯 我可以帮你:\n\n${BOT_INFO.commands.join('\n')}\n\n` +
      `⏱️ 支持多种时长格式:\n` +
      `30分钟、1小时、1h30m、1天、3600秒 等\n\n` +
      `发送"帮助"查看完整命令列表～`
    );
    return true;
  }

  // 检查打招呼
  if (matchPattern(message, INTRO_PATTERNS.greeting)) {
    const greetings = [
      `你好呀！我是${BOT_INFO.name}，有什么可以帮你的吗？`,
      `嗨～我在呢！需要打卡吗？`,
      `你好！发送"帮助"可以查看我的功能哦～`,
      `在的在的！今天也要加油打卡哦！💪`
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    sendReply(ws, event, randomGreeting);
    return true;
  }

  return false;
}

// 解析时长字符串，返回分钟数
function parseDuration(durationStr: string): number | null {
  // 支持多种格式组合
  let totalMinutes = 0;
  let matched = false;

  // 复合格式: "1小时30分钟", "2h30m", "1时30分"
  const compoundMatch = durationStr.match(/^([\d.]+)\s*(小时|时|h|H)\s*([\d.]+)\s*(分钟|分|m|M)?$/);
  if (compoundMatch) {
    totalMinutes = Math.round(parseFloat(compoundMatch[1]) * 60 + parseFloat(compoundMatch[3]));
    return totalMinutes > 0 ? totalMinutes : null;
  }

  // 天数: "1天", "2d", "1日"
  const dayMatch = durationStr.match(/^([\d.]+)\s*(天|日|d|D)$/);
  if (dayMatch) {
    return Math.round(parseFloat(dayMatch[1]) * 24 * 60);
  }

  // 小时: "1小时", "2h", "1.5时", "3hr", "2hrs"
  const hourMatch = durationStr.match(/^([\d.]+)\s*(小时|时|h|H|hr|hrs|hour|hours)$/i);
  if (hourMatch) {
    return Math.round(parseFloat(hourMatch[1]) * 60);
  }

  // 分钟: "30分钟", "45m", "30分", "60min", "90mins"
  const minMatch = durationStr.match(/^([\d.]+)\s*(分钟|分|m|M|min|mins|minute|minutes)?$/i);
  if (minMatch) {
    return Math.round(parseFloat(minMatch[1]));
  }

  // 秒数转分钟: "3600秒", "1800s" (向上取整到分钟)
  const secMatch = durationStr.match(/^([\d.]+)\s*(秒|s|sec|secs|second|seconds)$/i);
  if (secMatch) {
    return Math.ceil(parseFloat(secMatch[1]) / 60);
  }

  return null;
}

// 处理打卡命令
async function handleCheckin(
  ws: WebSocket,
  event: Message,
  args: string[]
): Promise<void> {
  const userId = event.user_id!;
  const groupId = event.group_id?.toString() || 'private';
  const nickname = event.sender?.card || event.sender?.nickname || '未知用户';

  // 检查参数
  if (args.length < 2) {
    sendReply(ws, event, '格式错误！请使用: @机器人 打卡 [时长] [内容]\n例如: @机器人 打卡 30分钟 学习TypeScript');
    return;
  }

  const durationStr = args[0];
  const content = args.slice(1).join(' ');

  const duration = parseDuration(durationStr);
  if (!duration || duration <= 0) {
    sendReply(ws, event, '时长格式错误！支持: 30分钟, 1小时, 1h30m, 90m, 1天, 3600秒');
    return;
  }

  try {
    // 查找或创建用户
    let user = await prisma.user.findUnique({
      where: { qqNumber: userId.toString() }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          qqNumber: userId.toString(),
          nickname: nickname
        }
      });
    } else if (user.nickname !== nickname) {
      // 更新昵称
      user = await prisma.user.update({
        where: { id: user.id },
        data: { nickname }
      });
    }

    // 创建打卡记录
    const checkin = await prisma.checkin.create({
      data: {
        userId: user.id,
        groupId,
        duration,
        content
      }
    });

    // 获取今日打卡统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await prisma.checkin.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: today }
      },
      _sum: { duration: true },
      _count: true
    });

    const totalMinutes = todayStats._sum.duration || 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const timeStr = hours > 0
      ? `${hours}小时${minutes > 0 ? minutes + '分钟' : ''}`
      : `${minutes}分钟`;

    sendReply(
      ws,
      event,
      `✅ 打卡成功！\n` +
      `📝 内容: ${content}\n` +
      `⏱️ 时长: ${duration}分钟\n` +
      `📊 今日累计: ${timeStr} (${todayStats._count}次)`
    );

  } catch (error) {
    console.error('打卡失败:', error);
    sendReply(ws, event, '打卡失败，请稍后重试');
  }
}

// 查询打卡记录
async function handleCheckinStats(
  ws: WebSocket,
  event: Message
): Promise<void> {
  const userId = event.user_id!;

  try {
    const user = await prisma.user.findUnique({
      where: { qqNumber: userId.toString() }
    });

    if (!user) {
      sendReply(ws, event, '你还没有打卡记录哦，快来打卡吧！');
      return;
    }

    // 获取总统计
    const totalStats = await prisma.checkin.aggregate({
      where: { userId: user.id },
      _sum: { duration: true },
      _count: true
    });

    // 获取今日统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await prisma.checkin.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: today }
      },
      _sum: { duration: true },
      _count: true
    });

    // 获取最近5条记录
    const recentCheckins = await prisma.checkin.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    const totalMinutes = totalStats._sum.duration || 0;
    const totalHours = Math.floor(totalMinutes / 60);
    const todayMinutes = todayStats._sum.duration || 0;

    let message = `📊 ${user.nickname} 的打卡统计\n\n`;
    message += `今日: ${todayMinutes}分钟 (${todayStats._count}次)\n`;
    message += `累计: ${totalHours}小时${totalMinutes % 60}分钟 (${totalStats._count}次)\n\n`;
    message += `📝 最近记录:\n`;

    recentCheckins.forEach((c: Checkin, i: number) => {
      const date = c.createdAt.toLocaleDateString('zh-CN');
      message += `${i + 1}. ${date} - ${c.duration}分钟 - ${c.content}\n`;
    });

    sendReply(ws, event, message);

  } catch (error) {
    console.error('查询失败:', error);
    sendReply(ws, event, '查询失败，请稍后重试');
  }
}

// 处理功能建议
async function handleSuggestion(
  ws: WebSocket,
  event: Message,
  content: string
): Promise<void> {
  const userId = event.user_id!;
  const groupId = event.group_id?.toString() || 'private';
  const nickname = event.sender?.card || event.sender?.nickname || '未知用户';

  if (!content.trim()) {
    sendReply(ws, event, '请告诉我你的建议内容哦～\n格式: 建议 [你的想法]');
    return;
  }

  try {
    await prisma.suggestion.create({
      data: {
        qqNumber: userId.toString(),
        nickname,
        groupId,
        content: content.trim()
      }
    });

    const responses = [
      `💡 收到！你的建议已经记录下来啦～\n开发者会认真考虑的，感谢你的反馈！`,
      `📝 好的好的！已经把你的想法记在小本本上了～\n下次更新说不定就能看到哦！`,
      `✨ 感谢你的宝贵建议！\n我们会努力变得更好的～`,
      `🎯 建议已收到！非常感谢你的反馈～\n你的想法对我们很重要！`
    ];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    sendReply(ws, event, randomResponse);

  } catch (error) {
    console.error('保存建议失败:', error);
    sendReply(ws, event, '保存建议失败，请稍后重试');
  }
}

// 发送回复
function sendReply(ws: WebSocket, event: Message, message: string): void {
  const reply = {
    action: event.message_type === 'group' ? 'send_group_msg' : 'send_private_msg',
    params: {
      ...(event.message_type === 'group'
        ? { group_id: event.group_id }
        : { user_id: event.user_id }),
      message
    }
  };

  ws.send(JSON.stringify(reply));
}

// 发送群消息（用于主动发送）
function sendGroupMessage(ws: WebSocket, groupId: string, message: string): void {
  const msg = {
    action: 'send_group_msg',
    params: {
      group_id: parseInt(groupId),
      message
    }
  };
  ws.send(JSON.stringify(msg));
}

// 检查管理员今日是否打卡
async function checkAdminCheckin(): Promise<boolean> {
  if (!SUPER_ADMIN_QQ) return true;

  const user = await prisma.user.findUnique({
    where: { qqNumber: SUPER_ADMIN_QQ }
  });

  if (!user) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayCheckin = await prisma.checkin.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: today }
    }
  });

  return !!todayCheckin;
}

// 获取下次督促时间（毫秒）
function getNextReminderTime(): number {
  const now = new Date();

  // 获取目标时区的当前时间
  const targetTime = new Date(now.toLocaleString('en-US', { timeZone: REMINDER_TIMEZONE }));

  // 设置今天的督促时间
  const reminderTime = new Date(targetTime);
  reminderTime.setHours(REMINDER_HOUR, REMINDER_MINUTE, 0, 0);

  // 如果今天的时间已过，设置为明天
  if (reminderTime <= targetTime) {
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  // 计算时间差（需要转换回本地时间）
  const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: REMINDER_TIMEZONE }));
  const diff = reminderTime.getTime() - nowInTimezone.getTime();

  return diff;
}

// 启动打卡督促定时器
function startReminderTimer(ws: WebSocket): void {
  if (!SUPER_ADMIN_QQ || !REMINDER_GROUP_ID) {
    console.log('督促功能未配置（需要 ADMIN_QQ 和 REMINDER_GROUP_ID）');
    return;
  }

  const scheduleNextReminder = () => {
    const delay = getNextReminderTime();
    const nextTime = new Date(Date.now() + delay);

    console.log(`下次打卡督促时间: ${nextTime.toLocaleString('zh-CN', { timeZone: REMINDER_TIMEZONE })} (${REMINDER_TIMEZONE})`);

    reminderTimer = setTimeout(async () => {
      try {
        const hasCheckedIn = await checkAdminCheckin();

        if (!hasCheckedIn && botEnabled) {
          const messages = [
            `[CQ:at,qq=${SUPER_ADMIN_QQ}] 今天还没打卡哦！快来记录一下今天的学习/运动吧～ 💪`,
            `[CQ:at,qq=${SUPER_ADMIN_QQ}] 打卡时间到！今天学习/运动了吗？别忘了记录哦～ 📝`,
            `[CQ:at,qq=${SUPER_ADMIN_QQ}] 嘿！今天的打卡还没完成呢，加油！ ⏰`,
            `[CQ:at,qq=${SUPER_ADMIN_QQ}] 温馨提醒：今日打卡尚未完成～ 🔔`
          ];
          const randomMsg = messages[Math.floor(Math.random() * messages.length)];
          sendGroupMessage(ws, REMINDER_GROUP_ID, randomMsg);
          console.log('已发送打卡督促消息');
        } else if (hasCheckedIn) {
          console.log('管理员今日已打卡，跳过督促');
        }
      } catch (error) {
        console.error('督促检查失败:', error);
      }

      // 调度下一次
      scheduleNextReminder();
    }, delay);
  };

  scheduleNextReminder();
  console.log('打卡督促定时器已启动');
}

function connectBot() {
  console.log('正在连接 NapCat...');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✅ 已连接到 NapCat');
    // 启动打卡督促定时器
    startReminderTimer(ws);
  });

  ws.on('message', async (data) => {
    try {
      const event: Message = JSON.parse(data.toString());

      // 只处理消息事件
      if (event.post_type !== 'message') return;

      const message = event.raw_message || '';
      console.log(`收到消息: ${message}`);

      // 移除 @ 信息，提取命令
      // 群消息格式: "[CQ:at,qq=xxx] 打卡 30分钟 学习"
      const cleanMessage = message
        .replace(/\[CQ:at,qq=\d+\]\s*/g, '')
        .trim();

      // 检查是否是群消息且被 @
      const isAtMe = message.includes('[CQ:at,qq=');

      // 群消息需要 @，私聊直接响应
      if (event.message_type === 'group' && !isAtMe) {
        return;
      }

      const userId = event.user_id?.toString() || '';
      const isAdmin = adminList.has(userId);
      const isSuperAdmin = userId === SUPER_ADMIN_QQ;

      // 检查开关机命令（只有管理员可以操作）
      if (isAdmin) {
        if (matchPattern(cleanMessage, POWER_PATTERNS.shutdown)) {
          botEnabled = false;
          const responses = [
            '好的，我去休息啦～有事再叫我 😴',
            '收到！进入睡眠模式... 💤',
            '好吧，我闭嘴了 🤐',
            '遵命！下班咯～ 🌙'
          ];
          sendReply(ws, event, responses[Math.floor(Math.random() * responses.length)]);
          return;
        }

        if (matchPattern(cleanMessage, POWER_PATTERNS.startup)) {
          botEnabled = true;
          const responses = [
            '我回来啦！有什么可以帮你的吗？ 😊',
            '收到！已重新上线～ ✨',
            '好的，我醒了！ ☀️',
            '开工开工！让我们开始吧～ 💪'
          ];
          sendReply(ws, event, responses[Math.floor(Math.random() * responses.length)]);
          return;
        }
      }

      // 如果机器人被关闭，不响应任何命令
      if (!botEnabled) {
        return;
      }

      // 先尝试模糊匹配自我介绍相关问题
      if (handleIntroduction(ws, event, cleanMessage)) {
        return;
      }

      const parts = cleanMessage.split(/\s+/);
      const command = parts[0];
      const args = parts.slice(1);

      // 命令处理
      switch (command) {
        case '打卡':
          await handleCheckin(ws, event, args);
          break;

        case '打卡记录':
        case '我的打卡':
          await handleCheckinStats(ws, event);
          break;

        case 'ping':
          sendReply(ws, event, 'pong');
          break;

        case 'github':
        case 'GitHub':
        case '代码':
        case '提交':
          if (!GITHUB_USERNAME) {
            sendReply(ws, event, '未配置 GitHub 用户名（GITHUB_USERNAME）');
            break;
          }
          try {
            const { count, repos } = await getGitHubTodayCommits(GITHUB_USERNAME);
            let response = '';

            if (count === 0) {
              const messages = [
                `😅 今天还没有提交代码哦～\n快去写点什么吧！`,
                `🤔 GitHub 今日提交: 0\n代码不会自己写的哦～`,
                `📭 今天的 GitHub 还是空空的～\n该开始coding了！`
              ];
              response = messages[Math.floor(Math.random() * messages.length)];
            } else if (count < 5) {
              response = `👍 今日 GitHub 提交: ${count} 次\n` +
                `📁 涉及仓库: ${repos.join(', ')}\n` +
                `继续加油！`;
            } else if (count < 10) {
              response = `🔥 今日 GitHub 提交: ${count} 次\n` +
                `📁 涉及仓库: ${repos.join(', ')}\n` +
                `效率不错！`;
            } else {
              response = `🚀 今日 GitHub 提交: ${count} 次\n` +
                `📁 涉及仓库: ${repos.join(', ')}\n` +
                `太强了！代码狂魔！`;
            }

            sendReply(ws, event, response);
          } catch (error) {
            console.error('获取 GitHub 数据失败:', error);
            sendReply(ws, event, '获取 GitHub 数据失败，请稍后重试');
          }
          break;

        case '督促':
        case '测试督促':
          if (!isSuperAdmin) {
            sendReply(ws, event, '只有超级管理员才能测试督促功能');
            break;
          }
          if (!REMINDER_GROUP_ID) {
            sendReply(ws, event, '督促功能未配置群号（REMINDER_GROUP_ID）');
            break;
          }
          try {
            const hasCheckedIn = await checkAdminCheckin();
            if (hasCheckedIn) {
              sendReply(ws, event, '✅ 你今天已经打卡了！\n（督促消息不会发送）');
            } else {
              const messages = [
                `[CQ:at,qq=${SUPER_ADMIN_QQ}] 今天还没打卡哦！快来记录一下今天的学习/运动吧～ 💪`,
                `[CQ:at,qq=${SUPER_ADMIN_QQ}] 打卡时间到！今天学习/运动了吗？别忘了记录哦～ 📝`,
                `[CQ:at,qq=${SUPER_ADMIN_QQ}] 嘿！今天的打卡还没完成呢，加油！ ⏰`,
                `[CQ:at,qq=${SUPER_ADMIN_QQ}] 温馨提醒：今日打卡尚未完成～ 🔔`
              ];
              const randomMsg = messages[Math.floor(Math.random() * messages.length)];
              sendGroupMessage(ws, REMINDER_GROUP_ID, randomMsg);
              sendReply(ws, event, '📢 督促消息已发送！');
            }
          } catch (error) {
            console.error('测试督促失败:', error);
            sendReply(ws, event, '测试督促失败，请查看日志');
          }
          break;

        case '建议':
        case '反馈':
        case '新功能':
          await handleSuggestion(ws, event, args.join(' '));
          break;

        case '添加管理':
        case '添加管理员':
          if (!isSuperAdmin) {
            sendReply(ws, event, '只有超级管理员才能添加管理员哦～');
            break;
          }
          if (args.length === 0) {
            sendReply(ws, event, '请指定要添加的管理员QQ号\n格式: 添加管理 [QQ号]');
            break;
          }
          const addQQ = args[0].replace(/\D/g, '');
          if (!addQQ) {
            sendReply(ws, event, 'QQ号格式不正确');
            break;
          }
          if (adminList.has(addQQ)) {
            sendReply(ws, event, `${addQQ} 已经是管理员了`);
          } else {
            adminList.add(addQQ);
            sendReply(ws, event, `✅ 已添加管理员: ${addQQ}\n当前管理员: ${Array.from(adminList).join(', ')}`);
          }
          break;

        case '删除管理':
        case '删除管理员':
        case '移除管理':
        case '移除管理员':
          if (!isSuperAdmin) {
            sendReply(ws, event, '只有超级管理员才能删除管理员哦～');
            break;
          }
          if (args.length === 0) {
            sendReply(ws, event, '请指定要删除的管理员QQ号\n格式: 删除管理 [QQ号]');
            break;
          }
          const delQQ = args[0].replace(/\D/g, '');
          if (!delQQ) {
            sendReply(ws, event, 'QQ号格式不正确');
            break;
          }
          if (delQQ === SUPER_ADMIN_QQ) {
            sendReply(ws, event, '不能删除超级管理员哦～');
          } else if (!adminList.has(delQQ)) {
            sendReply(ws, event, `${delQQ} 不是管理员`);
          } else {
            adminList.delete(delQQ);
            sendReply(ws, event, `✅ 已删除管理员: ${delQQ}\n当前管理员: ${Array.from(adminList).join(', ')}`);
          }
          break;

        case '管理员列表':
        case '管理列表':
          if (!isAdmin) {
            sendReply(ws, event, '只有管理员才能查看管理员列表');
            break;
          }
          sendReply(ws, event, `👑 管理员列表:\n${Array.from(adminList).map(qq => qq === SUPER_ADMIN_QQ ? `${qq} (超管)` : qq).join('\n')}`);
          break;

        case '帮助':
        case 'help':
          let helpMsg = '📖 可用命令:\n\n' +
            '打卡 [时长] [内容]\n' +
            '  例: 打卡 30分钟 学习TypeScript\n\n' +
            '打卡记录 - 查看打卡统计\n\n' +
            'github/代码 - 查看今日GitHub提交\n\n' +
            '建议 [内容] - 提交功能建议\n\n' +
            'ping - 测试机器人';

          if (isAdmin) {
            helpMsg += '\n\n👑 管理员命令:\n' +
              '闭嘴/关机 - 关闭机器人\n' +
              '开机/醒醒 - 开启机器人\n' +
              '管理员列表 - 查看管理员';
          }

          if (isSuperAdmin) {
            helpMsg += '\n\n⭐ 超管命令:\n' +
              '添加管理 [QQ] - 添加管理员\n' +
              '删除管理 [QQ] - 删除管理员\n' +
              '督促 - 测试打卡督促';
          }

          sendReply(ws, event, helpMsg);
          break;

        default:
          if (cleanMessage) {
            sendReply(ws, event, '未知命令，发送"帮助"查看可用命令');
          }
      }

    } catch (err) {
      console.error('处理消息失败:', err);
    }
  });

  ws.on('close', () => {
    console.log('连接已断开，5秒后重连...');
    // 清除定时器
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = null;
    }
    setTimeout(connectBot, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket 错误:', err.message);
  });
}

// 优雅退出
process.on('SIGINT', async () => {
  console.log('\n正在关闭...');
  if (reminderTimer) {
    clearTimeout(reminderTimer);
  }
  await prisma.$disconnect();
  process.exit(0);
});

connectBot();
