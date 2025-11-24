import "dotenv/config";
import WebSocket from 'ws';
import { PrismaClient, Checkin, Suggestion, Achievement } from './generated/prisma/client';

// 成就定义
const ACHIEVEMENTS: Record<string, { name: string; description: string; icon: string }> = {
  'first_checkin': { name: '初来乍到', description: '完成首次打卡', icon: '🎯' },
  'streak_3': { name: '小试牛刀', description: '连续打卡3天', icon: '🔥' },
  'streak_7': { name: '持之以恒', description: '连续打卡7天', icon: '💪' },
  'streak_30': { name: '打卡狂人', description: '连续打卡30天', icon: '🏆' },
  'total_1h': { name: '崭露头角', description: '累计打卡1小时', icon: '⭐' },
  'total_10h': { name: '初具规模', description: '累计打卡10小时', icon: '🌟' },
  'total_100h': { name: '百炼成钢', description: '累计打卡100小时', icon: '💎' },
  'debt_free': { name: '信用良好', description: '还清所有贷款负债', icon: '✨' },
  'early_bird': { name: '早起鸟儿', description: '早上6-8点打卡', icon: '🌅' },
  'night_owl': { name: '夜猫子', description: '晚上22-24点打卡', icon: '🌙' }
};

// 随机鼓励语
const ENCOURAGEMENTS = [
  '每一次努力都在让你变得更强！',
  '坚持就是胜利，你做到了！',
  '今天的汗水是明天的收获～',
  '比昨天的自己更进一步！',
  '积少成多，你正在创造奇迹！',
  '自律即自由，继续加油！',
  '种一棵树最好的时间是十年前，其次是现在。',
  '千里之行，始于足下。',
  '不积跬步，无以至千里。',
  '今日事今日毕，你很棒！',
  '每天进步一点点，终将遇见更好的自己。',
  '成功的秘诀就是每天都比别人多努力一点。',
  '你的努力终将成就无可替代的自己！',
  '保持热爱，奔赴山海！',
  '所有的努力都不会被辜负～'
];

// 达成目标的祝贺语
const GOAL_ACHIEVED_MESSAGES = [
  '🎉 太棒了！今日目标已达成！',
  '🌟 完美！你完成了今天的目标！',
  '💯 目标达成！你是最棒的！',
  '🏅 恭喜！今日任务圆满完成！',
  '✨ 厉害了！目标已拿下！'
];

// 获取随机鼓励语
function getRandomEncouragement(): string {
  return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
}

// 获取随机目标达成祝贺
function getGoalAchievedMessage(): string {
  return GOAL_ACHIEVED_MESSAGES[Math.floor(Math.random() * GOAL_ACHIEVED_MESSAGES.length)];
}

const WS_URL = process.env.WS_URL || 'ws://localhost:6100';
const prisma = new PrismaClient();

// 版本信息
const VERSION = 'v1.0.0';
const VERSION_FEATURES = [
  '打卡记录与贷款打卡',
  '排行榜（今日/本周/总榜）',
  '成就系统（10种成就）',
  '每日目标设置',
  'AI 个性化分析',
  '周报功能'
];

// AI 配置
const AI_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'Qwen/Qwen2.5-7B-Instruct';

// AI 调用函数
async function callAI(systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (!AI_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      console.error('AI API 错误:', response.status);
      return null;
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('AI 调用失败:', error);
    return null;
  }
}

// 获取用户打卡分析数据
async function getUserAnalyticsData(userId: number) {
  const today = getTodayStart();
  const weekStart = getWeekStart();
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  // 本周打卡
  const weekCheckins = await prisma.checkin.findMany({
    where: {
      userId,
      createdAt: { gte: weekStart },
      isLoan: false
    },
    orderBy: { createdAt: 'desc' }
  });

  // 上周打卡
  const lastWeekCheckins = await prisma.checkin.findMany({
    where: {
      userId,
      createdAt: { gte: lastWeekStart, lt: weekStart },
      isLoan: false
    }
  });

  // 所有打卡（用于分析常见内容和时段）
  const allCheckins = await prisma.checkin.findMany({
    where: { userId, isLoan: false },
    orderBy: { createdAt: 'desc' },
    take: 50 // 最近50条
  });

  // 计算统计
  const weekMinutes = weekCheckins.reduce((sum, c) => sum + c.duration, 0);
  const lastWeekMinutes = lastWeekCheckins.reduce((sum, c) => sum + c.duration, 0);

  // 分析常见内容（提取关键词）
  const contentCounts: Record<string, number> = {};
  allCheckins.forEach(c => {
    const content = c.content.trim();
    contentCounts[content] = (contentCounts[content] || 0) + c.duration;
  });
  const topContents = Object.entries(contentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([content, minutes]) => `${content}(${formatDuration(minutes)})`);

  // 分析常见打卡时段
  const hourCounts: Record<number, number> = {};
  allCheckins.forEach(c => {
    const hour = c.createdAt.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  const topHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([hour]) => `${hour}点`);

  // 获取用户信息
  const user = await prisma.user.findUnique({ where: { id: userId } });

  return {
    weekMinutes,
    weekCount: weekCheckins.length,
    lastWeekMinutes,
    lastWeekCount: lastWeekCheckins.length,
    streakDays: user?.streakDays || 0,
    maxStreak: user?.maxStreak || 0,
    topContents,
    topHours,
    recentCheckins: weekCheckins.slice(0, 5).map(c => ({
      content: c.content,
      duration: c.duration,
      date: c.createdAt.toLocaleDateString('zh-CN')
    }))
  };
}

// 生成AI分析
async function generateAIAnalysis(userId: number, nickname: string): Promise<string | null> {
  const data = await getUserAnalyticsData(userId);

  // 如果数据太少，不生成分析
  if (data.weekCount < 2 && data.lastWeekCount < 2) {
    return null;
  }

  const systemPrompt = `你是一个打卡机器人的AI助手，负责分析用户的打卡数据并给出个性化的洞察和建议。
要求：
- 用简短、温暖、有趣的语气
- 2-3句话，不超过80字
- 要基于数据给出具体的观察
- 可以适当调侃但要友善
- 不要用"您"，用"你"`;

  const userPrompt = `用户「${nickname}」的打卡数据：
- 本周：${formatDuration(data.weekMinutes)}，${data.weekCount}次打卡
- 上周：${formatDuration(data.lastWeekMinutes)}，${data.lastWeekCount}次打卡
- 连续打卡：${data.streakDays}天（历史最长${data.maxStreak}天）
- 常打卡内容：${data.topContents.join('、') || '暂无'}
- 常打卡时段：${data.topHours.join('、') || '暂无'}

请给出个性化分析和建议。`;

  return await callAI(systemPrompt, userPrompt);
}

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

// 机器人QQ号（用于检测是否被@）
const BOT_QQ = process.env.BOT_QQ || '';

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
  // 使用配置的时区计算今天的日期范围
  const now = new Date();
  const todayInTimezone = new Date(now.toLocaleString('en-US', { timeZone: REMINDER_TIMEZONE }));
  const todayStart = new Date(todayInTimezone);
  todayStart.setHours(0, 0, 0, 0);

  // 转换为 ISO 格式用于比较
  const todayISO = todayStart.toISOString().split('T')[0];

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'QQ-Bot'
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    let commitCount = 0;
    const repos = new Set<string>();

    // 方法1: 获取用户事件（公开 + 有token时的私有）
    const eventsResponse = await fetch(`https://api.github.com/users/${username}/events?per_page=100`, {
      headers
    });

    if (eventsResponse.ok) {
      const events = await eventsResponse.json() as any[];

      for (const event of events) {
        if (event.type === 'PushEvent') {
          // 将事件时间转换为配置的时区
          const eventTime = new Date(event.created_at);
          const eventInTimezone = new Date(eventTime.toLocaleString('en-US', { timeZone: REMINDER_TIMEZONE }));
          const eventDateISO = eventInTimezone.toISOString().split('T')[0];

          if (eventDateISO === todayISO) {
            const commits = event.payload?.commits?.length || 0;
            commitCount += commits;
            if (event.repo?.name) {
              repos.add(event.repo.name.split('/')[1] || event.repo.name);
            }
          }
        }
      }
    }

    // 方法2: 如果有 token，额外获取私有仓库的事件
    if (GITHUB_TOKEN) {
      const privateEventsResponse = await fetch(`https://api.github.com/users/${username}/events/private?per_page=100`, {
        headers
      });

      if (privateEventsResponse.ok) {
        const privateEvents = await privateEventsResponse.json() as any[];

        for (const event of privateEvents) {
          if (event.type === 'PushEvent') {
            const eventTime = new Date(event.created_at);
            const eventInTimezone = new Date(eventTime.toLocaleString('en-US', { timeZone: REMINDER_TIMEZONE }));
            const eventDateISO = eventInTimezone.toISOString().split('T')[0];

            if (eventDateISO === todayISO) {
              const commits = event.payload?.commits?.length || 0;
              commitCount += commits;
              if (event.repo?.name) {
                repos.add(event.repo.name.split('/')[1] || event.repo.name);
              }
            }
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
  version: '1.1.0',
  description: '一个帮助大家记录和追踪学习、运动等活动的群打卡机器人',
  commands: [
    '🆕 我想打卡 - 新人注册',
    '📝 打卡 [时长] [内容] - 记录打卡',
    '💸 打卡 贷款 [时长] [内容] - 贷款打卡',
    '📊 打卡记录 - 查看统计(含AI分析)',
    '📅 周报 - 本周报告(含AI总结)',
    '💰 负债 - 查看贷款负债',
    '🎯 设置目标 [时长] - 每日目标',
    '🏆 排行榜 - 今日/周/总榜',
    '🎖️ 成就 - 查看成就',
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
      `30分钟、1小时、1h30m、3h30min、1天、3600秒 等\n\n` +
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

  // 复合格式: "1小时30分钟", "2h30m", "1时30分", "3h30min"
  const compoundMatch = durationStr.match(/^([\d.]+)\s*(小时|时|h|H)\s*([\d.]+)\s*(分钟|分|m|M|min|mins|minute|minutes)?$/i);
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

// 格式化时长显示
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
  }
  return `${mins}分钟`;
}

// 获取今天的日期（0点）
function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

// 获取本周一的日期（0点）
function getWeekStart(): Date {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1); // 调整到周一
  const monday = new Date(today.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// 更新连续打卡天数
async function updateStreak(userId: number): Promise<{ streakDays: number; maxStreak: number; isNewStreak: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return { streakDays: 0, maxStreak: 0, isNewStreak: false };
  }

  const today = getTodayStart();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newStreakDays = user.streakDays;
  let isNewStreak = false;

  if (!user.lastCheckinDate) {
    // 首次打卡
    newStreakDays = 1;
    isNewStreak = true;
  } else {
    const lastDate = new Date(user.lastCheckinDate);
    lastDate.setHours(0, 0, 0, 0);

    if (lastDate.getTime() === today.getTime()) {
      // 今天已打卡，不更新连续天数
      return { streakDays: user.streakDays, maxStreak: user.maxStreak, isNewStreak: false };
    } else if (lastDate.getTime() === yesterday.getTime()) {
      // 昨天打卡了，连续+1
      newStreakDays = user.streakDays + 1;
      isNewStreak = true;
    } else {
      // 断签了，重新开始
      newStreakDays = 1;
      isNewStreak = true;
    }
  }

  const newMaxStreak = Math.max(user.maxStreak, newStreakDays);

  await prisma.user.update({
    where: { id: userId },
    data: {
      streakDays: newStreakDays,
      maxStreak: newMaxStreak,
      lastCheckinDate: today
    }
  });

  return { streakDays: newStreakDays, maxStreak: newMaxStreak, isNewStreak };
}

// 授予成就
async function grantAchievement(userId: number, achievementId: string): Promise<boolean> {
  try {
    // 检查是否已获得该成就
    const existing = await prisma.achievement.findUnique({
      where: {
        userId_achievementId: { userId, achievementId }
      }
    });

    if (existing) {
      return false; // 已有成就
    }

    // 授予成就
    await prisma.achievement.create({
      data: { userId, achievementId }
    });

    return true; // 新获得成就
  } catch (error) {
    console.error('授予成就失败:', error);
    return false;
  }
}

// 检查并授予成就
async function checkAchievements(
  userId: number,
  streakDays: number,
  totalMinutes: number,
  currentDebt: number,
  previousDebt: number,
  isLoan: boolean
): Promise<string[]> {
  const newAchievements: string[] = [];

  // 只有正常打卡才检查大部分成就
  if (!isLoan) {
    // 首次打卡成就 - 只要有正常打卡记录就应该有这个成就
    if (await grantAchievement(userId, 'first_checkin')) {
      newAchievements.push('first_checkin');
    }

    // 连续打卡成就
    if (streakDays >= 3 && await grantAchievement(userId, 'streak_3')) {
      newAchievements.push('streak_3');
    }
    if (streakDays >= 7 && await grantAchievement(userId, 'streak_7')) {
      newAchievements.push('streak_7');
    }
    if (streakDays >= 30 && await grantAchievement(userId, 'streak_30')) {
      newAchievements.push('streak_30');
    }

    // 累计时长成就
    if (totalMinutes >= 60 && await grantAchievement(userId, 'total_1h')) {
      newAchievements.push('total_1h');
    }
    if (totalMinutes >= 600 && await grantAchievement(userId, 'total_10h')) {
      newAchievements.push('total_10h');
    }
    if (totalMinutes >= 6000 && await grantAchievement(userId, 'total_100h')) {
      newAchievements.push('total_100h');
    }

    // 还清负债成就
    if (previousDebt > 0 && currentDebt === 0) {
      if (await grantAchievement(userId, 'debt_free')) {
        newAchievements.push('debt_free');
      }
    }

    // 时间段成就
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 8) {
      if (await grantAchievement(userId, 'early_bird')) {
        newAchievements.push('early_bird');
      }
    }
    if (hour >= 22 && hour <= 23) {
      if (await grantAchievement(userId, 'night_owl')) {
        newAchievements.push('night_owl');
      }
    }
  }

  return newAchievements;
}

// 计算用户当前贷款总额
async function getUserDebt(userId: number): Promise<number> {
  // 获取所有贷款打卡的总时长
  const loanStats = await prisma.checkin.aggregate({
    where: {
      userId,
      isLoan: true
    },
    _sum: { duration: true }
  });

  // 获取所有正常打卡的总时长
  const normalStats = await prisma.checkin.aggregate({
    where: {
      userId,
      isLoan: false
    },
    _sum: { duration: true }
  });

  const totalLoan = loanStats._sum.duration || 0;
  const totalNormal = normalStats._sum.duration || 0;

  // 负债 = 贷款总额 - 正常打卡总额（最小为0）
  return Math.max(0, totalLoan - totalNormal);
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
    sendReply(ws, event, '格式错误！请使用: @机器人 打卡 [时长] [内容]\n例如: @机器人 打卡 30分钟 学习TypeScript\n\n💸 贷款打卡: @机器人 打卡 贷款 [时长] [内容]');
    return;
  }

  // 检查是否是贷款打卡
  const isLoan = args[0] === '贷款';
  const durationStr = isLoan ? args[1] : args[0];
  const content = isLoan ? args.slice(2).join(' ') : args.slice(1).join(' ');

  // 贷款打卡需要至少3个参数
  if (isLoan && args.length < 3) {
    sendReply(ws, event, '贷款打卡格式: @机器人 打卡 贷款 [时长] [内容]\n例如: @机器人 打卡 贷款 1小时 学习');
    return;
  }

  const duration = parseDuration(durationStr);
  if (!duration || duration <= 0) {
    sendReply(ws, event, '时长格式错误！支持: 30分钟, 1小时, 1h30m, 3h30min, 90m, 1天, 3600秒');
    return;
  }

  // 限制最大时长为7天（10080分钟），防止数据库溢出
  const MAX_DURATION = 10080; // 7天
  if (duration > MAX_DURATION) {
    sendReply(ws, event, `时长太长了！最多支持7天（${MAX_DURATION}分钟）`);
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

    // 获取打卡前的负债
    const debtBefore = await getUserDebt(user.id);

    // 创建打卡记录
    await prisma.checkin.create({
      data: {
        userId: user.id,
        groupId,
        duration,
        content,
        isLoan
      }
    });

    // 获取打卡后的负债
    const debtAfter = await getUserDebt(user.id);

    // 更新连续打卡天数（只有正常打卡才算）
    let streakInfo = { streakDays: 0, maxStreak: 0, isNewStreak: false };
    if (!isLoan) {
      streakInfo = await updateStreak(user.id);
    }

    // 获取今日打卡统计（只统计正常打卡）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await prisma.checkin.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: today },
        isLoan: false
      },
      _sum: { duration: true },
      _count: true
    });

    const todayMinutes = todayStats._sum.duration || 0;

    // 获取累计正常打卡时长（用于成就检查）
    const totalNormalStats = await prisma.checkin.aggregate({
      where: { userId: user.id, isLoan: false },
      _sum: { duration: true }
    });
    const totalNormalMinutes = totalNormalStats._sum.duration || 0;

    // 检查成就
    const newAchievements = await checkAchievements(
      user.id,
      streakInfo.streakDays,
      totalNormalMinutes,
      debtAfter,
      debtBefore,
      isLoan
    );

    if (isLoan) {
      // 贷款打卡的回复
      const loanMessages = [
        '记得要按时还款哦！别当老赖～ 😏',
        '贷款一时爽，还款火葬场！💀',
        '又在透支未来了？小心打卡破产！😱',
        '贷款打卡+1，你的信用额度还够吗？🏦',
        '先欠着吧，但利息可不低哦～ 📈'
      ];

      // 如果连续贷款（之前就有负债），用更调侃的消息
      const isConsecutiveLoan = debtBefore > 0;
      const consecutiveMessages = [
        '又在贷款了？这是要成为打卡界的老赖吗！😤',
        '连续贷款警告⚠️ 再这样下去要上打卡征信黑名单了！',
        '负债累累还在贷？你这是要打卡破产啊！💸',
        '贷款狂魔！你的打卡信用卡都要刷爆了！🔥',
        '欠债不还，天理不容！快去正常打卡还债！⚡'
      ];

      const messagePool = isConsecutiveLoan ? consecutiveMessages : loanMessages;
      const randomMsg = messagePool[Math.floor(Math.random() * messagePool.length)];

      sendReply(
        ws,
        event,
        `💸 贷款打卡成功！\n` +
        `📝 内容: ${content}\n` +
        `⏱️ 借款时长: ${formatDuration(duration)}\n` +
        `📊 当前负债: ${formatDuration(debtAfter)}\n` +
        `⚠️ ${randomMsg}`
      );
    } else {
      // 正常打卡的回复
      let replyMsg = `✅ 打卡成功！\n` +
        `📝 内容: ${content}\n` +
        `⏱️ 时长: ${formatDuration(duration)}\n`;

      // 如果有还款
      if (debtBefore > 0) {
        const repaid = Math.min(duration, debtBefore);
        replyMsg += `💰 本次还款: ${formatDuration(repaid)}\n`;

        if (debtAfter > 0) {
          replyMsg += `📊 剩余负债: ${formatDuration(debtAfter)}\n`;
        } else {
          replyMsg += `🎉 恭喜！你已还清所有贷款！\n`;
        }
      }

      replyMsg += `📊 今日累计: ${formatDuration(todayMinutes)} (${todayStats._count}次)\n`;

      // 显示目标进度
      if (user.dailyGoal && user.dailyGoal > 0) {
        const progress = Math.min(100, Math.round((todayMinutes / user.dailyGoal) * 100));
        const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));

        if (todayMinutes >= user.dailyGoal) {
          // 检查是否是刚刚达成目标
          const previousTodayMinutes = todayMinutes - duration;
          if (previousTodayMinutes < user.dailyGoal) {
            replyMsg += `\n${getGoalAchievedMessage()}\n`;
          }
          replyMsg += `🎯 目标: ${progressBar} ${progress}%\n`;
        } else {
          const remaining = user.dailyGoal - todayMinutes;
          replyMsg += `🎯 目标: ${progressBar} ${progress}%\n`;
          replyMsg += `   还差 ${formatDuration(remaining)} 达成目标\n`;
        }
      }

      // 显示连续打卡信息
      if (streakInfo.streakDays > 0) {
        if (streakInfo.isNewStreak && streakInfo.streakDays === 1) {
          replyMsg += `🔥 开始新的连续打卡！\n`;
        } else if (streakInfo.streakDays >= 7) {
          replyMsg += `🔥 连续打卡 ${streakInfo.streakDays} 天！太强了！\n`;
        } else {
          replyMsg += `🔥 连续打卡 ${streakInfo.streakDays} 天\n`;
        }
      }

      // 显示新获得的成就
      if (newAchievements.length > 0) {
        replyMsg += `\n🏆 解锁成就：`;
        for (const achId of newAchievements) {
          const ach = ACHIEVEMENTS[achId];
          if (ach) {
            replyMsg += `\n${ach.icon} ${ach.name} - ${ach.description}`;
          }
        }
        replyMsg += '\n';
      }

      // 添加随机鼓励语
      replyMsg += `\n💬 ${getRandomEncouragement()}`;

      sendReply(ws, event, replyMsg);
    }

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
    const totalNormal = await prisma.checkin.aggregate({
      where: { userId: user.id, isLoan: false },
      _sum: { duration: true },
      _count: true
    });

    const totalLoan = await prisma.checkin.aggregate({
      where: { userId: user.id, isLoan: true },
      _sum: { duration: true },
      _count: true
    });

    // 获取今日统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayNormal = await prisma.checkin.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: today },
        isLoan: false
      },
      _sum: { duration: true },
      _count: true
    });

    const todayLoan = await prisma.checkin.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: today },
        isLoan: true
      },
      _sum: { duration: true },
      _count: true
    });

    // 计算净时长（正常打卡 - 贷款）
    const totalNetMinutes = (totalNormal._sum.duration || 0) - (totalLoan._sum.duration || 0);
    const todayNetMinutes = (todayNormal._sum.duration || 0) - (todayLoan._sum.duration || 0);
    const totalCount = totalNormal._count + totalLoan._count;
    const todayCount = todayNormal._count + todayLoan._count;

    // 实际打卡时长（只计算正常打卡）
    const totalActualMinutes = totalNormal._sum.duration || 0;
    const todayActualMinutes = todayNormal._sum.duration || 0;

    // 获取当前负债
    const currentDebt = await getUserDebt(user.id);

    // 获取最近5条记录
    const recentCheckins = await prisma.checkin.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    let message = `📊 ${user.nickname} 的打卡统计\n\n`;

    // 显示今日
    message += `今日: ${formatDuration(todayActualMinutes)} (${todayNormal._count}次)\n`;

    // 显示累计实际打卡
    message += `累计: ${formatDuration(totalActualMinutes)} (${totalNormal._count}次)\n`;

    // 显示净时长（如果有负债）
    if (currentDebt > 0) {
      if (totalNetMinutes >= 0) {
        message += `净时长: ${formatDuration(totalNetMinutes)}\n`;
      } else {
        message += `净时长: -${formatDuration(Math.abs(totalNetMinutes))}\n`;
      }
      message += `💸 当前负债: ${formatDuration(currentDebt)}\n`;
    }

    message += `\n📝 最近记录:\n`;

    recentCheckins.forEach((c: Checkin, i: number) => {
      const date = c.createdAt.toLocaleDateString('zh-CN');
      const loanMark = c.isLoan ? ' 💸' : '';
      message += `${i + 1}. ${date} - ${c.duration}分钟 - ${c.content}${loanMark}\n`;
    });

    // 生成 AI 分析
    const aiAnalysis = await generateAIAnalysis(user.id, user.nickname);
    if (aiAnalysis) {
      message += `\n🤖 AI 小结:\n${aiAnalysis}`;
    }

    sendReply(ws, event, message);

  } catch (error) {
    console.error('查询失败:', error);
    sendReply(ws, event, '查询失败，请稍后重试');
  }
}

// 查看指定用户的打卡记录
async function handleViewUserStats(
  ws: WebSocket,
  event: Message,
  targetQQ: string
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { qqNumber: targetQQ }
    });

    if (!user) {
      sendReply(ws, event, `未找到 QQ ${targetQQ} 的打卡记录`);
      return;
    }

    // 获取总统计
    const totalNormal = await prisma.checkin.aggregate({
      where: { userId: user.id, isLoan: false },
      _sum: { duration: true },
      _count: true
    });

    const totalLoan = await prisma.checkin.aggregate({
      where: { userId: user.id, isLoan: true },
      _sum: { duration: true },
      _count: true
    });

    // 获取今日统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayNormal = await prisma.checkin.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: today },
        isLoan: false
      },
      _sum: { duration: true },
      _count: true
    });

    const todayLoan = await prisma.checkin.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: today },
        isLoan: true
      },
      _sum: { duration: true },
      _count: true
    });

    // 计算净时长
    const totalNetMinutes = (totalNormal._sum.duration || 0) - (totalLoan._sum.duration || 0);
    const todayNetMinutes = (todayNormal._sum.duration || 0) - (todayLoan._sum.duration || 0);
    const totalCount = totalNormal._count + totalLoan._count;
    const todayCount = todayNormal._count + todayLoan._count;

    // 实际打卡时长（只计算正常打卡）
    const totalActualMinutes = totalNormal._sum.duration || 0;
    const todayActualMinutes = todayNormal._sum.duration || 0;

    // 获取当前负债
    const currentDebt = await getUserDebt(user.id);

    // 获取最近10条记录
    const recentCheckins = await prisma.checkin.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    let message = `📊 ${user.nickname} 的打卡记录\n\n`;

    // 显示今日
    message += `今日: ${formatDuration(todayActualMinutes)} (${todayNormal._count}次)\n`;

    // 显示累计实际打卡
    message += `累计: ${formatDuration(totalActualMinutes)} (${totalNormal._count}次)\n`;

    // 显示连续打卡
    if (user.streakDays > 0) {
      message += `🔥 连续打卡: ${user.streakDays}天\n`;
    }

    // 显示净时长和负债信息（如果有负债）
    if (currentDebt > 0) {
      if (totalNetMinutes >= 0) {
        message += `净时长: ${formatDuration(totalNetMinutes)}\n`;
      } else {
        message += `净时长: -${formatDuration(Math.abs(totalNetMinutes))}\n`;
      }
      message += `💸 当前负债: ${formatDuration(currentDebt)}\n`;
    }

    message += `\n📝 最近记录:\n`;

    recentCheckins.forEach((c: Checkin, i: number) => {
      const date = c.createdAt.toLocaleDateString('zh-CN');
      const loanMark = c.isLoan ? ' 💸' : '';
      message += `${i + 1}. ${date} - ${c.duration}分钟 - ${c.content}${loanMark}\n`;
    });

    sendReply(ws, event, message);

  } catch (error) {
    console.error('查询用户记录失败:', error);
    sendReply(ws, event, '查询失败，请稍后重试');
  }
}

// 处理排行榜查询
async function handleRanking(
  ws: WebSocket,
  event: Message,
  type: 'today' | 'week' | 'total'
): Promise<void> {
  const groupId = event.group_id?.toString() || 'private';

  try {
    let startDate: Date | undefined;
    let title: string;

    if (type === 'today') {
      startDate = getTodayStart();
      title = '📊 今日打卡排行榜';
    } else if (type === 'week') {
      startDate = getWeekStart();
      title = '📊 本周打卡排行榜';
    } else {
      title = '📊 总打卡排行榜';
    }

    // 查询正常打卡数据（只计算实际打卡，不含贷款）
    const normalStats = await prisma.checkin.groupBy({
      by: ['userId'],
      where: {
        groupId,
        isLoan: false,
        ...(startDate ? { createdAt: { gte: startDate } } : {})
      },
      _sum: { duration: true },
      _count: true
    });

    if (normalStats.length === 0) {
      const emptyMsg = type === 'today'
        ? '今天还没有人打卡哦，快来争第一！'
        : type === 'week'
        ? '本周还没有人打卡哦，快来开启新的一周！'
        : '还没有打卡记录，快来创造历史！';
      sendReply(ws, event, emptyMsg);
      return;
    }

    // 转换为数组并排序（按实际打卡时长）
    const rankings = normalStats
      .map(stat => ({
        userId: stat.userId,
        duration: stat._sum.duration || 0,
        count: stat._count
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    // 获取用户信息
    const userIds = rankings.map(r => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // 构建排行榜消息
    let message = `${title}\n\n`;
    const medals = ['🥇', '🥈', '🥉'];

    rankings.forEach((r, i) => {
      const user = userMap.get(r.userId);
      const nickname = user?.nickname || '未知用户';
      const medal = i < 3 ? medals[i] : `${i + 1}.`;

      message += `${medal} ${nickname}\n`;
      message += `   ${formatDuration(r.duration)} (${r.count}次)\n`;
    });

    sendReply(ws, event, message);

  } catch (error) {
    console.error('查询排行榜失败:', error);
    sendReply(ws, event, '查询排行榜失败，请稍后重试');
  }
}

// 处理群统计查询
async function handleGroupStats(
  ws: WebSocket,
  event: Message
): Promise<void> {
  const groupId = event.group_id?.toString() || 'private';

  if (groupId === 'private') {
    sendReply(ws, event, '群统计功能只能在群里使用哦～');
    return;
  }

  try {
    const today = getTodayStart();

    // 今日正常打卡统计（只计算实际打卡）
    const todayNormal = await prisma.checkin.aggregate({
      where: {
        groupId,
        createdAt: { gte: today },
        isLoan: false
      },
      _sum: { duration: true },
      _count: true
    });

    // 今日打卡人数（去重，只统计正常打卡）
    const todayUsers = await prisma.checkin.groupBy({
      by: ['userId'],
      where: {
        groupId,
        createdAt: { gte: today },
        isLoan: false
      }
    });

    // 群内注册总人数
    const totalUsers = await prisma.user.count({
      where: {
        checkins: {
          some: { groupId }
        }
      }
    });

    // 本周统计（只计算实际打卡）
    const weekStart = getWeekStart();
    const weekNormal = await prisma.checkin.aggregate({
      where: {
        groupId,
        createdAt: { gte: weekStart },
        isLoan: false
      },
      _sum: { duration: true },
      _count: true
    });

    // 统计数据
    const todayMinutes = todayNormal._sum.duration || 0;
    const todayCount = todayNormal._count;
    const todayUserCount = todayUsers.length;
    const weekMinutes = weekNormal._sum.duration || 0;
    const weekCount = weekNormal._count;

    // 计算打卡率
    const checkinRate = totalUsers > 0
      ? Math.round((todayUserCount / totalUsers) * 100)
      : 0;

    let message = `📊 群打卡统计\n\n`;
    message += `📅 今日\n`;
    message += `├ 打卡人数: ${todayUserCount}/${totalUsers}人 (${checkinRate}%)\n`;
    message += `├ 打卡次数: ${todayCount}次\n`;
    message += `└ 打卡时长: ${formatDuration(todayMinutes)}\n\n`;
    message += `📅 本周\n`;
    message += `├ 打卡次数: ${weekCount}次\n`;
    message += `└ 打卡时长: ${formatDuration(weekMinutes)}`;

    sendReply(ws, event, message);

  } catch (error) {
    console.error('查询群统计失败:', error);
    sendReply(ws, event, '查询失败，请稍后重试');
  }
}

// 查看成就
async function handleAchievements(
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

    // 自动补发老用户应得的成就
    const normalCheckinCount = await prisma.checkin.count({
      where: { userId: user.id, isLoan: false }
    });

    if (normalCheckinCount > 0) {
      // 有打卡记录就补发"初来乍到"
      await grantAchievement(user.id, 'first_checkin');

      // 检查累计时长成就
      const totalStats = await prisma.checkin.aggregate({
        where: { userId: user.id, isLoan: false },
        _sum: { duration: true }
      });
      const totalMinutes = totalStats._sum.duration || 0;

      if (totalMinutes >= 60) await grantAchievement(user.id, 'total_1h');
      if (totalMinutes >= 600) await grantAchievement(user.id, 'total_10h');
      if (totalMinutes >= 6000) await grantAchievement(user.id, 'total_100h');

      // 检查连续打卡成就
      if (user.maxStreak >= 3) await grantAchievement(user.id, 'streak_3');
      if (user.maxStreak >= 7) await grantAchievement(user.id, 'streak_7');
      if (user.maxStreak >= 30) await grantAchievement(user.id, 'streak_30');

      // 检查还清负债成就（如果当前无负债且有过贷款记录）
      const loanCount = await prisma.checkin.count({
        where: { userId: user.id, isLoan: true }
      });
      if (loanCount > 0) {
        const debt = await getUserDebt(user.id);
        if (debt === 0) await grantAchievement(user.id, 'debt_free');
      }
    }

    // 获取用户已解锁的成就
    const userAchievements = await prisma.achievement.findMany({
      where: { userId: user.id },
      orderBy: { unlockedAt: 'desc' }
    });

    const totalAchievements = Object.keys(ACHIEVEMENTS).length;
    const unlockedCount = userAchievements.length;

    let message = `🏆 ${user.nickname} 的成就\n\n`;
    message += `已解锁: ${unlockedCount}/${totalAchievements}\n\n`;

    if (unlockedCount === 0) {
      message += `还没有解锁任何成就哦～\n快去打卡获得你的第一个成就吧！`;
    } else {
      message += `✨ 已解锁:\n`;
      for (const ua of userAchievements) {
        const ach = ACHIEVEMENTS[ua.achievementId];
        if (ach) {
          const date = ua.unlockedAt.toLocaleDateString('zh-CN');
          message += `${ach.icon} ${ach.name}\n   ${ach.description} (${date})\n`;
        }
      }

      // 显示未解锁的成就
      const unlockedIds = new Set(userAchievements.map(ua => ua.achievementId));
      const lockedAchievements = Object.entries(ACHIEVEMENTS)
        .filter(([id]) => !unlockedIds.has(id));

      if (lockedAchievements.length > 0) {
        message += `\n🔒 未解锁:\n`;
        for (const [id, ach] of lockedAchievements) {
          message += `${ach.icon} ${ach.name} - ${ach.description}\n`;
        }
      }
    }

    sendReply(ws, event, message);

  } catch (error) {
    console.error('查询成就失败:', error);
    sendReply(ws, event, '查询失败，请稍后重试');
  }
}

// 生成周报
async function handleWeeklyReport(
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

    const data = await getUserAnalyticsData(user.id);

    // 计算变化
    const minutesDiff = data.weekMinutes - data.lastWeekMinutes;
    const countDiff = data.weekCount - data.lastWeekCount;
    const percentChange = data.lastWeekMinutes > 0
      ? Math.round((minutesDiff / data.lastWeekMinutes) * 100)
      : (data.weekMinutes > 0 ? 100 : 0);

    let message = `📅 ${user.nickname} 的周报\n\n`;

    // 本周统计
    message += `📊 本周统计\n`;
    message += `├ 打卡时长: ${formatDuration(data.weekMinutes)}\n`;
    message += `├ 打卡次数: ${data.weekCount}次\n`;
    message += `└ 连续天数: ${data.streakDays}天\n\n`;

    // 与上周对比
    message += `📈 对比上周\n`;
    if (minutesDiff > 0) {
      message += `├ 时长: +${formatDuration(minutesDiff)} (↑${percentChange}%)\n`;
    } else if (minutesDiff < 0) {
      message += `├ 时长: -${formatDuration(Math.abs(minutesDiff))} (↓${Math.abs(percentChange)}%)\n`;
    } else {
      message += `├ 时长: 持平\n`;
    }

    if (countDiff > 0) {
      message += `└ 次数: +${countDiff}次\n`;
    } else if (countDiff < 0) {
      message += `└ 次数: ${countDiff}次\n`;
    } else {
      message += `└ 次数: 持平\n`;
    }

    // 常打卡内容
    if (data.topContents.length > 0) {
      message += `\n🎯 主要内容\n`;
      data.topContents.forEach((content, i) => {
        message += `${i + 1}. ${content}\n`;
      });
    }

    // AI 总结
    const aiSummary = await generateWeeklyAISummary(user.id, user.nickname, data);
    if (aiSummary) {
      message += `\n🤖 AI 总结:\n${aiSummary}`;
    }

    sendReply(ws, event, message);

  } catch (error) {
    console.error('生成周报失败:', error);
    sendReply(ws, event, '生成周报失败，请稍后重试');
  }
}

// 生成周报AI总结
async function generateWeeklyAISummary(
  userId: number,
  nickname: string,
  data: Awaited<ReturnType<typeof getUserAnalyticsData>>
): Promise<string | null> {
  if (data.weekCount < 1) {
    return null;
  }

  const minutesDiff = data.weekMinutes - data.lastWeekMinutes;
  const percentChange = data.lastWeekMinutes > 0
    ? Math.round((minutesDiff / data.lastWeekMinutes) * 100)
    : 0;

  const systemPrompt = `你是一个打卡机器人的AI助手，负责生成用户的周报总结。
要求：
- 用简短、温暖、有趣的语气
- 3-4句话，不超过100字
- 要基于数据变化给出具体评价
- 给出下周的建议或鼓励
- 可以适当调侃但要友善`;

  const userPrompt = `用户「${nickname}」的周报数据：
- 本周：${formatDuration(data.weekMinutes)}，${data.weekCount}次
- 上周：${formatDuration(data.lastWeekMinutes)}，${data.lastWeekCount}次
- 变化：${percentChange > 0 ? '+' : ''}${percentChange}%
- 连续打卡：${data.streakDays}天
- 本周主要内容：${data.topContents.join('、') || '暂无'}

请生成周报总结和下周建议。`;

  return await callAI(systemPrompt, userPrompt);
}

// 设置每日目标
async function handleSetGoal(
  ws: WebSocket,
  event: Message,
  args: string[]
): Promise<void> {
  const userId = event.user_id!;
  const nickname = event.sender?.card || event.sender?.nickname || '未知用户';

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
    }

    // 检查是否要清除目标
    if (args.length === 0 || args[0] === '清除' || args[0] === '取消') {
      await prisma.user.update({
        where: { id: user.id },
        data: { dailyGoal: null }
      });
      sendReply(ws, event, '✅ 已清除每日目标');
      return;
    }

    // 解析目标时长
    const goalMinutes = parseDuration(args[0]);
    if (!goalMinutes || goalMinutes <= 0) {
      sendReply(ws, event, '格式错误！请使用: 设置目标 [时长]\n例如: 设置目标 2小时\n\n清除目标: 设置目标 清除');
      return;
    }

    // 限制最大目标
    if (goalMinutes > 1440) { // 24小时
      sendReply(ws, event, '目标时长最多24小时哦～');
      return;
    }

    // 更新目标
    await prisma.user.update({
      where: { id: user.id },
      data: { dailyGoal: goalMinutes }
    });

    sendReply(
      ws,
      event,
      `🎯 每日目标已设置: ${formatDuration(goalMinutes)}\n\n` +
      `打卡时会显示目标进度，达成后会有特别祝贺！\n` +
      `清除目标: 设置目标 清除`
    );

  } catch (error) {
    console.error('设置目标失败:', error);
    sendReply(ws, event, '设置失败，请稍后重试');
  }
}

// 注册打卡
async function handleRegister(
  ws: WebSocket,
  event: Message
): Promise<void> {
  const userId = event.user_id!;
  const nickname = event.sender?.card || event.sender?.nickname || '未知用户';

  try {
    // 检查用户是否已存在
    let user = await prisma.user.findUnique({
      where: { qqNumber: userId.toString() }
    });

    if (user) {
      // 用户已存在，更新昵称
      if (user.nickname !== nickname) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { nickname }
        });
      }

      sendReply(
        ws,
        event,
        `👋 ${nickname}，你已经注册过啦！\n\n` +
        `📊 快发送"打卡记录"查看你的统计吧～\n\n` +
        `💡 打卡格式: 打卡 [时长] [内容]\n` +
        `例: 打卡 30分钟 学习英语`
      );
    } else {
      // 创建新用户
      user = await prisma.user.create({
        data: {
          qqNumber: userId.toString(),
          nickname: nickname
        }
      });

      const welcomeMessages = [
        `🎉 欢迎 ${nickname} 加入打卡！\n\n`,
        `✨ ${nickname}，注册成功！\n\n`,
        `👏 太棒了！${nickname} 已加入打卡大家庭！\n\n`
      ];

      sendReply(
        ws,
        event,
        welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)] +
        `📝 打卡格式: 打卡 [时长] [内容]\n` +
        `例: 打卡 30分钟 学习英语\n\n` +
        `💸 贷款打卡: 打卡 贷款 [时长] [内容]\n\n` +
        `📊 查看记录: 打卡记录\n` +
        `💰 查看负债: 负债\n\n` +
        `加油打卡，一起进步！💪`
      );
    }

  } catch (error) {
    console.error('注册失败:', error);
    sendReply(ws, event, '注册失败，请稍后重试');
  }
}

// 查询负债情况
async function handleDebtQuery(
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

    const currentDebt = await getUserDebt(user.id);

    if (currentDebt === 0) {
      const messages = [
        `🎉 ${user.nickname} 目前无负债！\n你是个诚实守信的好同学～`,
        `✨ ${user.nickname} 信用良好！\n没有任何贷款负债，继续保持！`,
        `👍 ${user.nickname} 零负债！\n你的打卡信用评分：满分！`
      ];
      sendReply(ws, event, messages[Math.floor(Math.random() * messages.length)]);
    } else {
      // 根据负债程度给出不同的调侃
      let debtLevel = '';
      let advice = '';

      if (currentDebt <= 60) {
        debtLevel = '轻度负债';
        advice = '小问题，一次打卡就能还清！';
      } else if (currentDebt <= 180) {
        debtLevel = '中度负债';
        advice = '还能抢救一下，加油打卡吧！';
      } else if (currentDebt <= 480) {
        debtLevel = '重度负债';
        advice = '这负债有点多啊，得加把劲了！';
      } else {
        debtLevel = '濒临破产';
        advice = '打卡界的老赖实锤了！快还债！';
      }

      sendReply(
        ws,
        event,
        `💸 ${user.nickname} 的负债情况\n\n` +
        `📊 当前负债: ${formatDuration(currentDebt)}\n` +
        `⚠️ 负债等级: ${debtLevel}\n` +
        `💡 建议: ${advice}\n\n` +
        `正常打卡即可自动还款哦～`
      );
    }

  } catch (error) {
    console.error('查询负债失败:', error);
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
      // 或手动输入: "@JoyeBot 打卡 30分钟 学习"
      const cleanMessage = message
        .replace(/\[CQ:at,qq=\d+\]\s*/g, '')
        .replace(/^@\S+\s*/g, '')  // 移除手动输入的 @xxx
        .trim();

      // 检查是否真的 @ 了机器人
      // 支持 CQ 码格式和手动输入的 @机器人名
      const isAtMe = BOT_QQ
        ? message.includes(`[CQ:at,qq=${BOT_QQ}]`) || /^@(JoyeBot|joye|打卡)/i.test(message)
        : message.includes('[CQ:at,qq=') || /^@/i.test(message);

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

        case '查看打卡':
        case 'ta的打卡':
        case '他的打卡':
        case '她的打卡':
          {
            // 支持 @某人 或直接输入 QQ 号
            const argStr = args.join(' ');
            // 匹配 CQ 码中的 QQ 号
            const atMatch = argStr.match(/\[CQ:at,qq=(\d+)\]/);
            // 匹配纯数字 QQ 号
            const qqMatch = argStr.match(/(\d{5,12})/);

            let targetQQ = '';
            if (atMatch) {
              targetQQ = atMatch[1];
            } else if (qqMatch) {
              targetQQ = qqMatch[1];
            }

            if (!targetQQ) {
              sendReply(ws, event, '请指定要查看的用户\n用法: 查看打卡 @某人\n或: 查看打卡 QQ号');
              break;
            }

            await handleViewUserStats(ws, event, targetQQ);
          }
          break;

        case '负债':
        case '我的负债':
        case '欠款':
        case '查看负债':
          await handleDebtQuery(ws, event);
          break;

        case '我想打卡':
        case '注册':
        case '加入打卡':
        case '注册打卡':
          await handleRegister(ws, event);
          break;

        case '今日排行':
        case '今日榜':
        case '日榜':
          await handleRanking(ws, event, 'today');
          break;

        case '本周排行':
        case '周排行':
        case '周榜':
          await handleRanking(ws, event, 'week');
          break;

        case '总排行':
        case '排行榜':
        case '总榜':
          await handleRanking(ws, event, 'total');
          break;

        case '群统计':
        case '群数据':
        case '今日统计':
          await handleGroupStats(ws, event);
          break;

        case '成就':
        case '我的成就':
        case '成就列表':
          await handleAchievements(ws, event);
          break;

        case '设置目标':
        case '目标':
        case '每日目标':
          await handleSetGoal(ws, event, args);
          break;

        case '周报':
        case '本周报告':
        case '我的周报':
          await handleWeeklyReport(ws, event);
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

        case '发布更新':
        case '版本更新':
        case '更新通知':
          if (!isSuperAdmin) {
            sendReply(ws, event, '只有超级管理员才能发布更新通知');
            break;
          }
          if (!REMINDER_GROUP_ID) {
            sendReply(ws, event, '未配置群号（REMINDER_GROUP_ID）');
            break;
          }
          {
            // 如果有自定义内容，使用自定义内容；否则使用默认功能列表
            const customContent = args.join(' ').trim();
            let updateMsg = `🎉 机器人已更新到 ${VERSION}！\n\n`;

            if (customContent) {
              updateMsg += `📝 更新内容：\n${customContent}`;
            } else {
              updateMsg += `✨ 主要功能：\n`;
              VERSION_FEATURES.forEach(feature => {
                updateMsg += `• ${feature}\n`;
              });
              updateMsg += `\n发送「帮助」查看所有命令～`;
            }

            sendGroupMessage(ws, REMINDER_GROUP_ID, updateMsg);
            sendReply(ws, event, '📢 更新通知已发送到群！');
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
            '🆕 我想打卡/注册 - 新人注册\n\n' +
            '📝 打卡 [时长] [内容]\n' +
            '  例: 打卡 30分钟 学习TypeScript\n\n' +
            '💸 打卡 贷款 [时长] [内容]\n' +
            '  (正常打卡可抵消贷款)\n\n' +
            '📊 打卡记录 - 查看统计(含AI分析)\n' +
            '👀 查看打卡 @某人 - 查看他人记录\n' +
            '📅 周报 - 本周报告(含AI总结)\n' +
            '💰 负债/欠款 - 查看贷款负债\n' +
            '🎯 设置目标 [时长] - 每日目标\n' +
            '🎖️ 成就 - 查看成就列表\n\n' +
            '🏆 今日排行/周榜/总榜 - 排行榜\n' +
            '📈 群统计 - 查看群整体数据\n\n' +
            '💻 github/代码 - 查看GitHub提交\n' +
            '💡 建议 [内容] - 提交功能建议';

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
              '督促 - 测试打卡督促\n' +
              '发布更新 [内容] - 发送版本更新通知';
          }

          sendReply(ws, event, helpMsg);
          break;

        default:
          // 只有当消息看起来像命令时才回复（排除表情、图片等CQ码和空消息）
          // 检查是否是纯文字命令（不以特殊字符开头，且不是空的）
          if (cleanMessage &&
              !cleanMessage.startsWith('[CQ:') &&
              /^[\u4e00-\u9fa5a-zA-Z]/.test(cleanMessage)) {
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
