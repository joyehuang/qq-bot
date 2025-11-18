import "dotenv/config";
import WebSocket from 'ws';
import { PrismaClient, Checkin } from './generated/prisma/client';

const WS_URL = 'ws://localhost:6100';
const prisma = new PrismaClient();

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
  abilities: [
    '打卡记录 - 帮你记录学习、运动等活动时长',
    '打卡统计 - 查看你的打卡历史和累计时间',
    '更多功能开发中...'
  ]
};

// 模糊匹配关键词组
const INTRO_PATTERNS = {
  identity: ['你是谁', '你叫什么', '你是什么', '你的名字', '介绍一下', '自我介绍', '是什么机器人', '什么bot', '你是啥'],
  ability: ['你能做什么', '你会什么', '你可以做什么', '有什么功能', '能干什么', '会干什么', '有啥功能', '能干啥', '怎么用', '如何使用', '使用方法', '使用说明'],
  greeting: ['你好', '在吗', '在不在', 'hello', 'hi', '嗨', '哈喽', '早上好', '下午好', '晚上好']
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
      `🤖 你好！我是 ${BOT_INFO.name}\n\n` +
      `我是一个群打卡机器人，专门帮助大家记录和追踪学习、运动等活动。\n\n` +
      `发送"帮助"查看详细使用方法～`
    );
    return true;
  }

  // 检查能力询问
  if (matchPattern(message, INTRO_PATTERNS.ability)) {
    let abilitiesText = BOT_INFO.abilities.map((a, i) => `${i + 1}. ${a}`).join('\n');
    sendReply(
      ws,
      event,
      `🎯 我的功能:\n\n${abilitiesText}\n\n` +
      `发送"帮助"查看具体命令格式～`
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
  // 支持格式: "30分钟", "1小时", "1.5h", "90m", "30"
  const hourMatch = durationStr.match(/^([\d.]+)\s*(小时|h|H)$/);
  if (hourMatch) {
    return Math.round(parseFloat(hourMatch[1]) * 60);
  }

  const minMatch = durationStr.match(/^([\d.]+)\s*(分钟|m|M)?$/);
  if (minMatch) {
    return Math.round(parseFloat(minMatch[1]));
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
    sendReply(ws, event, '时长格式错误！支持: 30分钟, 1小时, 1.5h, 90m');
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

function connectBot() {
  console.log('正在连接 NapCat...');

  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✅ 已连接到 NapCat');
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

        case '帮助':
        case 'help':
          sendReply(
            ws,
            event,
            '📖 可用命令:\n\n' +
            '打卡 [时长] [内容]\n' +
            '  例: 打卡 30分钟 学习TypeScript\n\n' +
            '打卡记录 - 查看打卡统计\n\n' +
            'ping - 测试机器人'
          );
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
    setTimeout(connectBot, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket 错误:', err.message);
  });
}

// 优雅退出
process.on('SIGINT', async () => {
  console.log('\n正在关闭...');
  await prisma.$disconnect();
  process.exit(0);
});

connectBot();
