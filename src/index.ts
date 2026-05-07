import "dotenv/config";
import WebSocket from 'ws';
import { PrismaClient, Checkin, Suggestion, Achievement } from '@prisma/client';
import { execFile } from 'child_process';
import { promisify } from 'util';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { getAIStyle } from './config/aiStyles';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

// 业务时区：所有"今天/昨天/本周一"边界统一用北京时间，与服务器物理时区无关。
const APP_TZ = 'Asia/Shanghai';

const execFileAsync = promisify(execFile);

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
  'laolai': { name: '老赖', description: '贷款打卡100小时以上', icon: '💰' },
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
const VERSION = 'v1.3.0';
const VERSION_FEATURES = [
  '打卡记录与贷款打卡',
  '排行榜（今日/本周/总榜）',
  '成就系统（10种成就）',
  '每日目标设置',
  'AI 风格系统（5种风格）',
  'AI 智能分类（自动识别学习内容）',
  '群头衔系统（自动管理）',
  'AI 个性化分析与周报',
  '查看他人打卡记录',
  '撤销打卡功能'
];

// AI 调用元数据（用于埋点：写入 ai_call_logs，供后台 dashboard 分析）。
// scenario 必填，方便按场景切片；callerQQ/groupQQ 在能拿到时也尽量填。
interface AICallMeta {
  scenario: string;
  callerQQ?: string;
  groupQQ?: string;
}

interface HermesAgentOptions {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  profile?: string;
  timeoutMs?: number;
  meta?: AICallMeta;
}

interface HermesAgentResult {
  success: boolean;
  content: string | null;
  error?: string;
  sessionId?: string;
}

// 把一次 hermes 调用落盘到 ai_call_logs。失败静默吞掉——这条记录丢了不能让 AI 调用本身坏掉。
async function recordAICall(params: {
  meta: AICallMeta | undefined;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  responseText: string | null;
  errorMsg?: string;
  sessionId?: string;
}): Promise<void> {
  // meta 没传也写一条（scenario=unknown），便于发现漏埋点的 caller。
  const scenario = params.meta?.scenario ?? 'unknown';
  try {
    await prisma.aICallLog.create({
      data: {
        scenario,
        callerQQ: params.meta?.callerQQ ?? null,
        groupQQ: params.meta?.groupQQ ?? null,
        model: params.model ?? null,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        responseText: params.responseText,
        durationMs: params.durationMs,
        status: params.status,
        errorMsg: params.errorMsg ?? null,
        sessionId: params.sessionId ?? null,
      },
    });
  } catch (err) {
    console.error('[AICallLog] 写入失败（不影响主流程）:', err);
  }
}

async function callHermesAgentV2(options: HermesAgentOptions): Promise<HermesAgentResult> {
  const {
    systemPrompt,
    userPrompt,
    model,
    profile = 'community',
    timeoutMs = 30000,
    meta,
  } = options;
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  // -p/--profile is a top-level flag in hermes_cli; it must precede the `chat` subcommand.
  const args: string[] = ['-p', profile, 'chat', '-q', fullPrompt, '-Q'];
  if (model) {
    args.push('-m', model);
  }

  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync('hermes', args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });

    // In quiet mode, hermes CLI writes `session_id: ...` to stderr and the
    // response body to stdout. Extract sessionId from stderr (if present) and
    // suppress that line so it's not logged as a warning.
    let sessionId: string | undefined;
    if (stderr && stderr.trim()) {
      const stderrLines = stderr.split('\n');
      const remaining: string[] = [];
      for (const line of stderrLines) {
        if (line.startsWith('session_id:')) {
          sessionId = line.slice('session_id:'.length).trim();
        } else if (line.trim()) {
          remaining.push(line);
        }
      }
      if (remaining.length > 0) {
        console.warn('[HermesAgent] stderr:', remaining.join('\n'));
      }
    }

    const content = stdout.trim();
    const durationMs = Date.now() - startedAt;
    void recordAICall({
      meta,
      systemPrompt,
      userPrompt,
      model,
      durationMs,
      status: 'success',
      responseText: content || null,
      sessionId,
    });
    return { success: true, content: content || null, sessionId };
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    let errorMsg = '未知错误';
    let status: 'error' | 'timeout' = 'error';
    if (error?.killed && (error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT')) {
      errorMsg = `Hermes Agent 调用超时（${timeoutMs}ms）`;
      status = 'timeout';
    } else if (error?.code === 'ENOENT') {
      errorMsg = 'hermes 命令未找到，请检查 Hermes Agent 是否已安装并在 PATH 中';
    } else if (error?.stderr) {
      errorMsg = `Hermes Agent 错误: ${String(error.stderr).trim()}`;
    } else if (error?.message) {
      errorMsg = error.message;
    }
    void recordAICall({
      meta,
      systemPrompt,
      userPrompt,
      model,
      durationMs,
      status,
      responseText: null,
      errorMsg,
    });
    return { success: false, content: null, error: errorMsg };
  }
}

async function callHermesAgent(
  systemPrompt: string,
  userPrompt: string,
  model?: string,
  meta?: AICallMeta
): Promise<string | null> {
  const result = await callHermesAgentV2({ systemPrompt, userPrompt, model, meta });
  if (!result.success) {
    console.error('[HermesAgent] 调用失败:', result.error);
    return null;
  }
  return result.content;
}

// AI 调用函数
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  meta?: AICallMeta
): Promise<string | null> {
  return callHermesAgent(systemPrompt, userPrompt, undefined, meta);
}

// AI 自动分类打卡内容
interface ClassificationResult {
  category: string;      // 一级分类：学习、项目、工作、运动、娱乐、其他
  subcategory: string;   // 二级分类：计算机·算法、计算机·AI学习、英语·听力等
}

const CLASSIFICATION_OPTIONS: ClassificationResult[] = [
  { category: '学习', subcategory: '计算机·算法' },
  { category: '学习', subcategory: '计算机·前端' },
  { category: '学习', subcategory: '计算机·后端' },
  { category: '学习', subcategory: '计算机·数据库' },
  { category: '学习', subcategory: '计算机·系统设计' },
  { category: '学习', subcategory: '计算机·DevOps' },
  { category: '学习', subcategory: '计算机·计算机基础' },
  { category: '学习', subcategory: '计算机·面试准备' },
  { category: '学习', subcategory: '计算机·AI学习' },
  { category: '学习', subcategory: '计算机·其他' },
  { category: '学习', subcategory: '英语·听力' },
  { category: '学习', subcategory: '英语·口语' },
  { category: '学习', subcategory: '英语·阅读' },
  { category: '学习', subcategory: '英语·写作' },
  { category: '学习', subcategory: '英语·词汇' },
  { category: '学习', subcategory: '英语·语法' },
  { category: '学习', subcategory: '英语·考试' },
  { category: '学习', subcategory: '其他学习' },
  { category: '项目', subcategory: '' },
  { category: '工作', subcategory: '' },
  { category: '运动', subcategory: '' },
  { category: '娱乐', subcategory: '' },
  { category: '其他', subcategory: '' }
];

const CLASSIFICATION_ALIASES: Record<string, ClassificationResult> = {
  '算法': { category: '学习', subcategory: '计算机·算法' },
  '前端': { category: '学习', subcategory: '计算机·前端' },
  '后端': { category: '学习', subcategory: '计算机·后端' },
  '数据库': { category: '学习', subcategory: '计算机·数据库' },
  '系统设计': { category: '学习', subcategory: '计算机·系统设计' },
  'devops': { category: '学习', subcategory: '计算机·DevOps' },
  '运维': { category: '学习', subcategory: '计算机·DevOps' },
  '计算机基础': { category: '学习', subcategory: '计算机·计算机基础' },
  '面试': { category: '学习', subcategory: '计算机·面试准备' },
  '八股': { category: '学习', subcategory: '计算机·面试准备' },
  'ai学习': { category: '学习', subcategory: '计算机·AI学习' },
  '机器学习': { category: '学习', subcategory: '计算机·AI学习' },
  '深度学习': { category: '学习', subcategory: '计算机·AI学习' },
  '大模型': { category: '学习', subcategory: '计算机·AI学习' },
  '英语听力': { category: '学习', subcategory: '英语·听力' },
  '听力': { category: '学习', subcategory: '英语·听力' },
  '口语': { category: '学习', subcategory: '英语·口语' },
  '阅读': { category: '学习', subcategory: '英语·阅读' },
  '写作': { category: '学习', subcategory: '英语·写作' },
  '词汇': { category: '学习', subcategory: '英语·词汇' },
  '语法': { category: '学习', subcategory: '英语·语法' },
  '考试': { category: '学习', subcategory: '英语·考试' },
  '其他学习': { category: '学习', subcategory: '其他学习' },
  '项目': { category: '项目', subcategory: '' },
  '工作': { category: '工作', subcategory: '' },
  '运动': { category: '运动', subcategory: '' },
  '娱乐': { category: '娱乐', subcategory: '' },
  '其他': { category: '其他', subcategory: '' }
};

function matchClassificationFromText(text: string): ClassificationResult | null {
  const normalized = text.replace(/\s+/g, '').toLowerCase();

  for (const [keyword, target] of Object.entries(CLASSIFICATION_ALIASES)) {
    const normalizedKey = keyword.replace(/\s+/g, '').toLowerCase();
    if (normalized.includes(normalizedKey)) {
      return target;
    }
  }

  for (const option of CLASSIFICATION_OPTIONS) {
    const label = (option.subcategory || option.category)
      .replace(/·/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (normalized.includes(label)) {
      return option;
    }
  }

  return null;
}

function formatClassificationLabel(result: ClassificationResult): string {
  if (!result.category) {
    return '未分类';
  }
  return result.subcategory ? `${result.category}/${result.subcategory}` : result.category;
}

async function classifyCheckin(content: string, meta?: AICallMeta): Promise<ClassificationResult> {
  // 快速关键词匹配（常见模式）
  const contentLower = content.toLowerCase();

  // 计算机相关关键词
  const computerKeywords = {
    '算法': ['算法', '刷题', 'leetcode', 'lc', '数据结构', '竞赛', 'acm', 'oi'],
    '前端': ['前端', 'html', 'css', 'javascript', 'js', 'react', 'vue', 'angular', 'ui', 'ux', '页面', '组件'],
    '后端': ['后端', 'api', 'node', 'java', 'python', 'go', 'rust', '服务器', '接口', '微服务', 'spring', 'django', 'flask'],
    '数据库': ['数据库', 'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'database', 'db'],
    '系统设计': ['架构', '系统设计', '分布式', '高并发', '设计模式', '微服务架构'],
    'DevOps': ['docker', 'kubernetes', 'k8s', 'ci/cd', 'jenkins', '部署', 'devops', '运维'],
    '计算机基础': ['网络', '操作系统', 'os', 'tcp', 'http', '编译原理', '计算机组成'],
    '面试准备': ['八股', '八股文', '面试', '面经', '校招', '秋招', '春招', '笔试', '面试题', '刷面试'],
    'AI学习': ['机器学习', '深度学习', 'ml', 'dl', 'ai', '人工智能', '神经网络', 'transformer', 'llm', '大模型', 'gpt', 'bert', 'agent', '强化学习', 'rl', 'cv', '计算机视觉', 'nlp', '自然语言处理', 'pytorch', 'tensorflow', 'keras']
  };

  // 计算机通用关键词（兜底）
  const computerGeneralKeywords = ['编程', '代码', 'code', 'coding', '程序', 'programming', '计算机', 'computer', 'cs', '软件', 'software', '技术', '学习编程'];

  // 英语相关关键词
  const englishKeywords = {
    '听力': ['听力', '听播客', '美剧', '听懂', 'listening', '听写', '精听', '泛听'],
    '口语': ['口语', '说', '对话', '演讲', 'speaking', '配音', '聊天', '交流'],
    '阅读': ['阅读', '读', '文章', 'reading', '读书', '英文书'],
    '写作': ['写作', '作文', 'writing', '写', '邮件', '翻译'],
    '词汇': ['单词', '词汇', '背单词', 'vocabulary', '词根', '词缀'],
    '语法': ['语法', 'grammar', '时态', '句式', '从句'],
    '考试': ['雅思', 'ielts', '托福', 'toefl', '四级', '六级', 'cet', '考试']
  };

  // 检查计算机相关
  for (const [subcat, keywords] of Object.entries(computerKeywords)) {
    if (keywords.some(kw => contentLower.includes(kw))) {
      return { category: '学习', subcategory: `计算机·${subcat}` };
    }
  }

  // 检查计算机通用关键词（兜底）
  if (computerGeneralKeywords.some(kw => contentLower.includes(kw))) {
    return { category: '学习', subcategory: '计算机·其他' };
  }

  // 检查英语相关
  for (const [subcat, keywords] of Object.entries(englishKeywords)) {
    if (keywords.some(kw => contentLower.includes(kw))) {
      return { category: '学习', subcategory: `英语·${subcat}` };
    }
  }

  // 其他快速匹配
  const projectKeywords = ['项目', '实战', '开发项目', '做项目', '毕设', '毕业设计', 'project', '课设', '课程设计', '大作业'];
  const workKeywords = ['工作', '写代码', '写文档', '开会', '会议', 'bug', '修复', '上班', '加班'];
  const exerciseKeywords = ['运动', '跑步', '健身', '锻炼', '瑜伽', '游泳', '篮球', '足球', '羽毛球', '乒乓球'];
  const entertainmentKeywords = ['游戏', '追剧', '电影', '娱乐', '放松', '玩', '社交'];

  if (projectKeywords.some(kw => contentLower.includes(kw))) {
    return { category: '项目', subcategory: '' };
  }
  if (workKeywords.some(kw => contentLower.includes(kw))) {
    return { category: '工作', subcategory: '' };
  }
  if (exerciseKeywords.some(kw => contentLower.includes(kw))) {
    return { category: '运动', subcategory: '' };
  }
  if (entertainmentKeywords.some(kw => contentLower.includes(kw))) {
    return { category: '娱乐', subcategory: '' };
  }

  // 无法快速匹配，调用 AI 分类
  const systemPrompt = `你是一个智能分类助手。根据用户的打卡内容，判断它属于哪个分类。

⚠️ 重要：必须严格按照以下分类返回，不得自创分类名称！

一级分类（category）只能是：学习、项目、工作、运动、娱乐、其他

二级分类（subcategory）规则：
1. 学习类必须选择以下之一：
   - 计算机·算法
   - 计算机·前端
   - 计算机·后端
   - 计算机·数据库
   - 计算机·系统设计
   - 计算机·DevOps
   - 计算机·计算机基础
   - 计算机·面试准备
   - 计算机·AI学习（机器学习、深度学习、LLM、大模型、Agent等）
   - 计算机·其他（其他计算机相关内容）
   - 英语·听力
   - 英语·口语
   - 英语·阅读
   - 英语·写作
   - 英语·词汇
   - 英语·语法
   - 英语·考试
   - 其他学习（数学、物理、专业课等非计算机非英语的学习）

2. 项目、工作、运动、娱乐、其他类：subcategory 必须为空字符串

如果无法判断或不确定，请返回 {"category": "其他", "subcategory": ""}

输出格式：只返回一行纯 JSON，格式为 {"category": "学习", "subcategory": "计算机·算法"}
不要添加任何解释文字，只返回JSON。`;

  const userPrompt = `请分类以下打卡内容：\n${content}`;

  try {
    const aiResponse = await callAI(systemPrompt, userPrompt, {
      scenario: 'classify',
      callerQQ: meta?.callerQQ,
      groupQQ: meta?.groupQQ,
    });
    if (aiResponse) {
      const result = JSON.parse(aiResponse.trim());
      return result;
    }
  } catch (error) {
    console.error('AI 分类解析失败:', error);
  }

  // AI 调用失败，返回其他
  return { category: '其他', subcategory: '' };
}

async function handleClassificationCorrection(
  ws: WebSocket,
  event: Message,
  cleanMessage: string
): Promise<boolean> {
  const intentMatched = /(分类|归类|标签|类型|类别)/.test(cleanMessage) && /(改成|改为|纠正|修正|错了|调整|应该)/.test(cleanMessage);

  if (!intentMatched) {
    return false;
  }

  const target = matchClassificationFromText(cleanMessage);
  const userQQ = event.user_id?.toString();

  if (!userQQ) {
    return false;
  }

  const user = await prisma.user.findUnique({ where: { qqNumber: userQQ } });

  if (!user) {
    sendReply(ws, event, '还没有找到你的打卡记录，先打一次卡再来调整分类吧～');
    return true;
  }

  const lastCheckin = await prisma.checkin.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  });

  if (!lastCheckin) {
    sendReply(ws, event, '没有找到可以修改的打卡记录哦～');
    return true;
  }

  if (!target) {
    const options = CLASSIFICATION_OPTIONS
      .map(opt => opt.subcategory || opt.category)
      .filter(Boolean)
      .join('\n• ');

    sendReply(
      ws,
      event,
      '没有识别到你想改成的分类，请在消息里带上目标分类名称～\n\n可选分类：\n• ' + options
    );
    return true;
  }

  const current: ClassificationResult = {
    category: lastCheckin.category || '',
    subcategory: lastCheckin.subcategory || ''
  };

  if (
    current.category === target.category &&
    (current.subcategory || '') === (target.subcategory || '')
  ) {
    sendReply(ws, event, `上一条已经是 ${formatClassificationLabel(current)} 啦～`);
    return true;
  }

  await prisma.checkin.update({
    where: { id: lastCheckin.id },
    data: { category: target.category, subcategory: target.subcategory || null }
  });

  const responseParts = [
    '已按照你的自然语言反馈修改分类（仅限上一条记录）：',
    `• 原分类：${formatClassificationLabel(current)}`,
    `• 新分类：${formatClassificationLabel(target)}`
  ];

  sendReply(ws, event, responseParts.join('\n'));
  return true;
}

// 生成 AI 鼓励语（打卡完成后的结语）
// 上下文：本次打卡信息 + 用户最近 7 天打卡历史 + aiStyle，让 AI 看到节奏与偏好
async function generateAIEncouragement(
  userId: number,
  user: { nickname: string; aiStyle: string; streakDays: number; dailyGoal: number | null },
  checkinInfo: { duration: number; content: string; todayMinutes: number; isGoalAchieved: boolean },
  meta?: { callerQQ?: string; groupQQ?: string }
): Promise<string> {
  try {
    const style = getAIStyle(user.aiStyle);
    const ctx = await getUserContextForAI(userId);
    const recentCheckinsText = ctx ? formatRecentCheckins(ctx.recentCheckins) : '（暂无最近打卡）';
    const totalRecent = ctx ? ctx.totalMinutesRecent : 0;

    const userPrompt = `用户 ${user.nickname} 刚刚完成了一次打卡：

【本次打卡】
- 时长：${Math.floor(checkinInfo.duration / 60)}小时${checkinInfo.duration % 60}分钟
- 内容：${checkinInfo.content}
- 今日累计：${Math.floor(checkinInfo.todayMinutes / 60)}小时${checkinInfo.todayMinutes % 60}分钟
- 当前连续打卡：${user.streakDays}天
${user.dailyGoal ? `- 每日目标：${Math.floor(user.dailyGoal / 60)}小时${user.dailyGoal % 60}分钟` : ''}
${checkinInfo.isGoalAchieved ? '- 今日目标已达成 ✨' : ''}

【最近 7 天打卡（共 ${totalRecent} 分钟）】
${recentCheckinsText}

请用你的风格给一句简短的回应/鼓励。要求：
- 结合最近打卡的节奏或主题（比如"看你这周第三次刷算法了"）
- 不要列点、不要复读上面的数据
- 长度 30-60 字，自然口语
- 只输出一句话本身`;

    const aiResponse = await callAI(style.systemPrompt, userPrompt, {
      scenario: 'checkin_reply',
      callerQQ: meta?.callerQQ,
      groupQQ: meta?.groupQQ,
    });
    if (!aiResponse || aiResponse.trim().length < 3) {
      return getRandomEncouragement();
    }
    return aiResponse.trim();
  } catch (error) {
    console.error('生成 AI 鼓励语失败:', error);
    return getRandomEncouragement();
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
async function generateAIAnalysis(
  userId: number,
  nickname: string,
  aiStyle: string,
  meta?: { callerQQ?: string; groupQQ?: string }
): Promise<string | null> {
  const data = await getUserAnalyticsData(userId);

  // 如果数据太少，不生成分析
  if (data.weekCount < 2 && data.lastWeekCount < 2) {
    return null;
  }

  const style = getAIStyle(aiStyle);
  const systemPrompt = `${style.systemPrompt}

你正在分析用户的打卡数据并给出个性化的洞察和建议。
要求：
- 基于你的风格给予回应
- 2-3句话，不超过100字
- 要基于数据给出具体的观察
- 不要用"您"，用"你"`;

  const userPrompt = `用户「${nickname}」的打卡数据：
- 本周：${formatDuration(data.weekMinutes)}，${data.weekCount}次打卡
- 上周：${formatDuration(data.lastWeekMinutes)}，${data.lastWeekCount}次打卡
- 连续打卡：${data.streakDays}天（历史最长${data.maxStreak}天）
- 常打卡内容：${data.topContents.join('、') || '暂无'}
- 常打卡时段：${data.topHours.join('、') || '暂无'}

请用你的风格给出个性化分析和建议。`;

  return await callAI(systemPrompt, userPrompt, {
    scenario: 'user_analysis',
    callerQQ: meta?.callerQQ,
    groupQQ: meta?.groupQQ,
  });
}

// 超级管理员QQ号（从环境变量读取，不可被删除）
const SUPER_ADMIN_QQ = process.env.ADMIN_QQ || '';

// 测试模式（仅超级管理员可切换，测试模式下打卡不会保存到数据库）
let testMode = false;

// 督促打卡配置
const REMINDER_GROUP_ID = process.env.REMINDER_GROUP_ID || ''; // 督促消息发送的群号
const REMINDER_HOUR = parseInt(process.env.REMINDER_HOUR || '19'); // 督促时间（小时，24小时制）
const REMINDER_MINUTE = parseInt(process.env.REMINDER_MINUTE || '0'); // 督促时间（分钟）
const REMINDER_TIMEZONE = process.env.REMINDER_TIMEZONE || 'Asia/Shanghai'; // 时区

// 断签提醒配置
const STREAK_WARNING_HOUR = parseInt(process.env.STREAK_WARNING_HOUR || '21'); // 断签警告时间（小时）
const STREAK_WARNING_MINUTE = parseInt(process.env.STREAK_WARNING_MINUTE || '0'); // 断签警告时间（分钟）
const STREAK_TAUNT_HOUR = parseInt(process.env.STREAK_TAUNT_HOUR || '9'); // 断签调侃时间（小时）
const STREAK_TAUNT_MINUTE = parseInt(process.env.STREAK_TAUNT_MINUTE || '0'); // 断签调侃时间（分钟）
const MIN_STREAK_FOR_REMINDER = 5; // 最少连续打卡天数才会被提醒（警告+调侃）

// 头衔系统配置
const TITLE_GROUP_ID = process.env.TITLE_GROUP_ID || REMINDER_GROUP_ID; // 启用头衔功能的群号（默认和督促群相同）
const DEBT_THRESHOLD = parseInt(process.env.DEBT_THRESHOLD || '300'); // 打卡老赖阈值（分钟，默认5小时）

// 机器人QQ号（用于检测是否被@）
const BOT_QQ = process.env.BOT_QQ || '';

// 管理员列表（包含超级管理员和动态添加的管理员）
const adminList: Set<string> = new Set();
if (SUPER_ADMIN_QQ) {
  adminList.add(SUPER_ADMIN_QQ);
}

// 机器人状态
let botEnabled = true;

// 已注册的 cron 任务（启动时构建，便于停机时统一停止）
const cronJobs: ScheduledTask[] = [];

function stopAllCronJobs(): void {
  for (const job of cronJobs) job.stop();
  cronJobs.length = 0;
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
    '🔙 撤销打卡 - 撤销今日最后一条',
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

// 获取今天的日期（北京时间 0 点）
function getTodayStart(): Date {
  return dayjs().tz(APP_TZ).startOf('day').toDate();
}

// 获取本周一的日期（北京时间 0 点）
function getWeekStart(): Date {
  return dayjs().tz(APP_TZ).startOf('isoWeek').toDate();
}

// 北京时间昨天的 0 点
function getYesterdayStart(): Date {
  return dayjs().tz(APP_TZ).startOf('day').subtract(1, 'day').toDate();
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
  const yesterday = getYesterdayStart();

  let newStreakDays = user.streakDays;
  let isNewStreak = false;

  if (!user.lastCheckinDate) {
    // 首次打卡
    newStreakDays = 1;
    isNewStreak = true;
  } else {
    // 把 lastCheckinDate 也按北京时间归到当天 0 点再比较，避免历史数据时区错位
    const lastDate = dayjs(user.lastCheckinDate).tz(APP_TZ).startOf('day').toDate();

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
  const senderId = event.user_id!;
  const groupId = event.group_id?.toString() || 'private';
  const senderNickname = event.sender?.card || event.sender?.nickname || '未知用户';

  const targetUserId = senderId;
  const targetNickname = senderNickname;
  const actualArgs = [...args];

  // 检查参数
  if (actualArgs.length < 2) {
    sendReply(ws, event, '格式错误！请使用:\n' +
      '• 打卡 [时长] [内容]\n' +
      '例如: @机器人 打卡 30分钟 学习TypeScript\n\n' +
      '💸 贷款打卡: @机器人 打卡 贷款 [时长] [内容]');
    return;
  }

  // 检查是否是贷款打卡
  const isLoan = actualArgs[0] === '贷款';
  const durationStr = isLoan ? actualArgs[1] : actualArgs[0];
  const content = isLoan ? actualArgs.slice(2).join(' ') : actualArgs.slice(1).join(' ');

  // 贷款打卡需要至少3个参数
  if (isLoan && actualArgs.length < 3) {
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
    // 查找或创建用户（为目标用户打卡）
    let user = await prisma.user.findUnique({
      where: { qqNumber: targetUserId.toString() }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          qqNumber: targetUserId.toString(),
          nickname: targetNickname
        }
      });
    }

    // 同步分类（打卡时立即分类）
    let classification = { category: '', subcategory: '' };
    try {
      classification = await classifyCheckin(content, {
        scenario: 'classify',
        callerQQ: targetUserId.toString(),
        groupQQ: groupId,
      });
      const testPrefix = testMode ? '[测试] ' : '';
      console.log(`${testPrefix}✅ 打卡分类: ${content} → ${classification.category}${classification.subcategory ? '/' + classification.subcategory : ''}`);
    } catch (error) {
      console.error('分类失败:', error);
    }

    // 测试模式：不保存到数据库
    if (testMode) {
      // 构建分类标签
      let categoryTag = '';
      if (classification.subcategory) {
        categoryTag = `【${classification.subcategory}】`;
      } else if (classification.category) {
        categoryTag = `【${classification.category}】`;
      }

      const testModePrefix = '🧪 【测试模式】\n';
      const forWhomPrefix = '';

      if (isLoan) {
        sendReply(
          ws,
          event,
          testModePrefix + forWhomPrefix +
          `💸 贷款打卡！${categoryTag ? ' ' + categoryTag : ''}\n` +
          `📝 内容: ${content}\n` +
          `⏱️ 借款时长: ${formatDuration(duration)}\n\n` +
          `⚠️ 测试模式下，此记录不会保存到数据库`
        );
      } else {
        sendReply(
          ws,
          event,
          testModePrefix + forWhomPrefix +
          `✅ 打卡成功！${categoryTag ? ' ' + categoryTag : ''}\n` +
          `📝 内容: ${content}\n` +
          `⏱️ 时长: ${formatDuration(duration)}\n\n` +
          `⚠️ 测试模式下，此记录不会保存到数据库`
        );
      }
      return;
    }

    // 正常模式：保存到数据库
    // 获取打卡前的负债
    const debtBefore = await getUserDebt(user.id);

    // 创建打卡记录（包含分类信息）
    const checkin = await prisma.checkin.create({
      data: {
        userId: user.id,
        groupId,
        duration,
        content,
        isLoan,
        category: classification.category || null,
        subcategory: classification.subcategory || null
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

      const forWhomPrefix = '';

      // 构建分类标签
      let categoryTag = '';
      if (classification.subcategory) {
        categoryTag = `【${classification.subcategory}】`;
      } else if (classification.category) {
        categoryTag = `【${classification.category}】`;
      }

      // 更新头衔
      await updateDebtTitle(ws, user.id, debtAfter);
      await updateDailyTopTitle(ws);

      sendReply(
        ws,
        event,
        forWhomPrefix +
        `💸 贷款打卡成功！${categoryTag ? ' ' + categoryTag : ''}\n` +
        `📝 内容: ${content}\n` +
        `⏱️ 借款时长: ${formatDuration(duration)}\n` +
        `📊 当前负债: ${formatDuration(debtAfter)}\n` +
        `⚠️ ${randomMsg}`
      );
    } else {
      // 正常打卡的回复
      const forWhomPrefix = '';

      // 构建分类标签
      let categoryTag = '';
      if (classification.subcategory) {
        categoryTag = `【${classification.subcategory}】`;
      } else if (classification.category) {
        categoryTag = `【${classification.category}】`;
      }

      let replyMsg = forWhomPrefix +
        `✅ 打卡成功！${categoryTag ? ' ' + categoryTag : ''}\n` +
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
            // 设置成就头衔（24小时后自动清除）
            if (TITLE_GROUP_ID) {
              const achievementTitle = `${ach.icon}${ach.name}`;
              setGroupTitle(ws, TITLE_GROUP_ID, targetUserId.toString(), achievementTitle, 86400);
            }
          }
        }
        replyMsg += '\n';
      }

      // 添加 AI 鼓励语
      {
        const isGoalAchieved = user.dailyGoal ? todayMinutes >= user.dailyGoal : false;
        const encouragement = await generateAIEncouragement(
          user.id,
          {
            nickname: user.nickname,
            aiStyle: user.aiStyle,
            streakDays: streakInfo.streakDays,
            dailyGoal: user.dailyGoal
          },
          {
            duration,
            content,
            todayMinutes,
            isGoalAchieved
          },
          {
            callerQQ: targetUserId.toString(),
            groupQQ: groupId,
          }
        );
        replyMsg += `\n💬 ${encouragement}`;
      }

      // 更新头衔
      await updateDebtTitle(ws, user.id, debtAfter);
      await updateDailyTopTitle(ws);

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
      const categoryMark = c.subcategory ? `【${c.subcategory}】` : (c.category ? `【${c.category}】` : '');
      message += `${i + 1}. ${date} - ${c.duration}分钟 ${categoryMark}- ${c.content}${loanMark}\n`;
    });

    // 获取本周分类统计
    const weekStart = getWeekStart();
    const weekCheckins = await prisma.checkin.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: weekStart },
        isLoan: false
      }
    });

    // 按分类汇总
    const categoryStats: Record<string, { minutes: number; subcategories: Record<string, number> }> = {};
    let totalWeekMinutes = 0;

    weekCheckins.forEach(c => {
      if (!c.category) return;

      totalWeekMinutes += c.duration;

      if (!categoryStats[c.category]) {
        categoryStats[c.category] = { minutes: 0, subcategories: {} };
      }

      categoryStats[c.category].minutes += c.duration;

      if (c.subcategory) {
        if (!categoryStats[c.category].subcategories[c.subcategory]) {
          categoryStats[c.category].subcategories[c.subcategory] = 0;
        }
        categoryStats[c.category].subcategories[c.subcategory] += c.duration;
      }
    });

    // 显示分类统计
    if (Object.keys(categoryStats).length > 0 && totalWeekMinutes > 0) {
      message += `\n📚 本周分类统计:\n`;

      // 按时长排序
      const sortedCategories = Object.entries(categoryStats)
        .sort((a, b) => b[1].minutes - a[1].minutes);

      sortedCategories.forEach(([category, data]) => {
        const percentage = Math.round((data.minutes / totalWeekMinutes) * 100);
        const barLength = Math.floor(percentage / 10);
        const bar = '▓'.repeat(barLength) + '░'.repeat(10 - barLength);

        message += `├─ ${category} ${formatDuration(data.minutes)} (${percentage}%)\n`;
        message += `│  ${bar}\n`;

        // 显示子分类
        const sortedSubcats = Object.entries(data.subcategories)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3); // 只显示前3个子分类

        if (sortedSubcats.length > 0) {
          sortedSubcats.forEach(([subcat, mins], idx) => {
            const isLast = idx === sortedSubcats.length - 1;
            const prefix = isLast ? '└─' : '├─';
            message += `│  ${prefix} ${subcat}: ${formatDuration(mins)}\n`;
          });
        }
      });
    }

    // 生成 AI 分析
    const aiAnalysis = await generateAIAnalysis(user.id, user.nickname, user.aiStyle, {
      callerQQ: userId.toString(),
      groupQQ: event.group_id?.toString(),
    });
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

    // 分类统计
    const weekStart = getWeekStart();
    const weekCheckins = await prisma.checkin.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: weekStart },
        isLoan: false
      }
    });

    // 按分类汇总
    const categoryStats: Record<string, { minutes: number; subcategories: Record<string, number> }> = {};
    let totalWeekMinutes = 0;

    weekCheckins.forEach(c => {
      if (!c.category) return;

      totalWeekMinutes += c.duration;

      if (!categoryStats[c.category]) {
        categoryStats[c.category] = { minutes: 0, subcategories: {} };
      }

      categoryStats[c.category].minutes += c.duration;

      if (c.subcategory) {
        if (!categoryStats[c.category].subcategories[c.subcategory]) {
          categoryStats[c.category].subcategories[c.subcategory] = 0;
        }
        categoryStats[c.category].subcategories[c.subcategory] += c.duration;
      }
    });

    // 显示分类分布
    if (Object.keys(categoryStats).length > 0 && totalWeekMinutes > 0) {
      message += `\n📚 学习分布\n`;

      // 按时长排序
      const sortedCategories = Object.entries(categoryStats)
        .sort((a, b) => b[1].minutes - a[1].minutes);

      sortedCategories.forEach(([category, data]) => {
        const percentage = Math.round((data.minutes / totalWeekMinutes) * 100);
        const barLength = Math.floor(percentage / 10);
        const bar = '▓'.repeat(barLength) + '░'.repeat(10 - barLength);

        message += `${category} ${percentage}% ${bar}\n`;

        // 显示TOP 2子分类
        const sortedSubcats = Object.entries(data.subcategories)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2);

        if (sortedSubcats.length > 0) {
          sortedSubcats.forEach(([subcat, mins]) => {
            const subcatPercentage = Math.round((mins / totalWeekMinutes) * 100);
            message += `  ├─ ${subcat} ${subcatPercentage}%\n`;
          });
        }
      });
    }

    // AI 总结
    const aiSummary = await generateWeeklyAISummary(user.id, user.nickname, data, user.aiStyle, {
      callerQQ: userId.toString(),
      groupQQ: event.group_id?.toString(),
    });
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
  data: Awaited<ReturnType<typeof getUserAnalyticsData>>,
  aiStyle: string,
  meta?: { callerQQ?: string; groupQQ?: string }
): Promise<string | null> {
  if (data.weekCount < 1) {
    return null;
  }

  const minutesDiff = data.weekMinutes - data.lastWeekMinutes;
  const percentChange = data.lastWeekMinutes > 0
    ? Math.round((minutesDiff / data.lastWeekMinutes) * 100)
    : 0;

  const style = getAIStyle(aiStyle);
  const systemPrompt = `${style.systemPrompt}

你正在生成用户的周报总结。
要求：
- 基于你的风格给予回应
- 3-4句话，不超过120字
- 要基于数据变化给出具体评价
- 给出下周的建议或鼓励`;

  const userPrompt = `用户「${nickname}」的周报数据：
- 本周：${formatDuration(data.weekMinutes)}，${data.weekCount}次
- 上周：${formatDuration(data.lastWeekMinutes)}，${data.lastWeekCount}次
- 变化：${percentChange > 0 ? '+' : ''}${percentChange}%
- 连续打卡：${data.streakDays}天
- 本周主要内容：${data.topContents.join('、') || '暂无'}

请用你的风格生成周报总结和下周建议。`;

  return await callAI(systemPrompt, userPrompt, {
    scenario: 'user_weekly_report',
    callerQQ: meta?.callerQQ,
    groupQQ: meta?.groupQQ,
  });
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

// 设置 AI 风格
async function handleSetAIStyle(
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

    // 如果没有参数，显示当前风格和所有可用风格
    if (args.length === 0) {
      const { getAllAIStyles } = await import('./config/aiStyles');
      const allStyles = getAllAIStyles();
      const currentStyle = allStyles.find(s => s.id === user.aiStyle);

      let replyMsg = `🎨 当前 AI 风格：${currentStyle?.name || '温柔鼓励型'}\n\n`;
      replyMsg += `📋 可用风格列表：\n`;

      for (const style of allStyles) {
        const current = style.id === user.aiStyle ? ' ✓' : '';
        replyMsg += `\n${style.id}${current}\n`;
        replyMsg += `  ${style.name} - ${style.description}\n`;
      }

      replyMsg += `\n使用方法: 设置风格 [风格ID]\n`;
      replyMsg += `例如: 设置风格 strict`;

      sendReply(ws, event, replyMsg);
      return;
    }

    // 验证风格 ID
    const styleId = args[0].toLowerCase();
    const { isValidAIStyle, getAIStyle } = await import('./config/aiStyles');

    if (!isValidAIStyle(styleId)) {
      sendReply(
        ws,
        event,
        `❌ 无效的风格 ID！\n\n` +
        `可用风格：encourage, strict, funny, professional, ridicule\n` +
        `查看详情: 风格列表`
      );
      return;
    }

    // 更新风格
    await prisma.user.update({
      where: { id: user.id },
      data: { aiStyle: styleId }
    });

    const style = getAIStyle(styleId);
    sendReply(
      ws,
      event,
      `🎨 AI 风格已设置为：${style.name}\n\n` +
      `${style.description}\n\n` +
      `下次打卡时就会使用新风格啦！`
    );

  } catch (error) {
    console.error('设置风格失败:', error);
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

// 设置群头衔
function setGroupTitle(ws: WebSocket, groupId: string, userId: string, title: string, duration: number = -1): void {
  if (!TITLE_GROUP_ID || groupId !== TITLE_GROUP_ID) {
    return; // 只在配置的群中启用头衔功能
  }

  const msg = {
    action: 'set_group_special_title',
    params: {
      group_id: parseInt(groupId),
      user_id: parseInt(userId),
      special_title: title,
      duration // -1 表示永久
    }
  };
  ws.send(JSON.stringify(msg));
  console.log(`设置群头衔: ${userId} -> ${title}`);
}

// 清除群头衔
function clearGroupTitle(ws: WebSocket, groupId: string, userId: string): void {
  setGroupTitle(ws, groupId, userId, '', -1);
}

// 更新每日第一头衔
async function updateDailyTopTitle(ws: WebSocket): Promise<void> {
  if (!TITLE_GROUP_ID) return;

  const today = getTodayStart();

  // 获取今日排行榜
  const todayRanking = await prisma.checkin.groupBy({
    by: ['userId'],
    where: {
      createdAt: { gte: today },
      isLoan: false
    },
    _sum: { duration: true },
    orderBy: { _sum: { duration: 'desc' } },
    take: 1
  });

  if (todayRanking.length === 0 || !todayRanking[0]._sum.duration) {
    return; // 今天还没有人打卡
  }

  const topUser = await prisma.user.findUnique({
    where: { id: todayRanking[0].userId }
  });

  if (topUser && todayRanking[0]._sum.duration > 0) {
    setGroupTitle(ws, TITLE_GROUP_ID, topUser.qqNumber, '今日第一🥇', -1);
  }
}

// 更新打卡老赖头衔
async function updateDebtTitle(ws: WebSocket, userId: number, debt: number): Promise<void> {
  if (!TITLE_GROUP_ID) return;

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) return;

  if (debt >= DEBT_THRESHOLD) {
    // 负债超过阈值，设置老赖头衔
    setGroupTitle(ws, TITLE_GROUP_ID, user.qqNumber, '打卡老赖💸', -1);
  } else if (debt === 0) {
    // 负债已清零，清除头衔（如果当前是老赖头衔的话）
    // 这里简化处理，直接清除，让其他头衔系统接管
    // clearGroupTitle(ws, TITLE_GROUP_ID, user.qqNumber);
  }
}

// 更新每周前三头衔
async function updateWeeklyTopTitles(ws: WebSocket): Promise<void> {
  if (!TITLE_GROUP_ID) return;

  const weekStart = getWeekStart();

  // 获取本周排行榜前三
  const weeklyRanking = await prisma.checkin.groupBy({
    by: ['userId'],
    where: {
      createdAt: { gte: weekStart },
      isLoan: false
    },
    _sum: { duration: true },
    orderBy: { _sum: { duration: 'desc' } },
    take: 3
  });

  // 设置前三名头衔
  const titles = ['周榜第一🥇', '周榜第二🥈', '周榜第三🥉'];

  for (let i = 0; i < weeklyRanking.length; i++) {
    const entry = weeklyRanking[i];
    if (!entry._sum.duration || entry._sum.duration === 0) continue;

    const user = await prisma.user.findUnique({
      where: { id: entry.userId }
    });

    if (user) {
      setGroupTitle(ws, TITLE_GROUP_ID, user.qqNumber, titles[i], -1);
    }
  }
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

// 检查潜在断签用户（今天还没打卡的连续打卡 >= MIN_STREAK_FOR_REMINDER 天的用户）
// 由 cron 在晚上某点触发；信任 streakDays（已被每日 0 点结算正确清零）
async function checkPotentialStreakBreaks(): Promise<{
  userId: number;
  qqNumber: string;
  nickname: string;
  currentStreak: number;
}[]> {
  const today = getTodayStart();
  const potentialBreaks: { userId: number; qqNumber: string; nickname: string; currentStreak: number }[] = [];

  const usersWithStreak = await prisma.user.findMany({
    where: { streakDays: { gte: MIN_STREAK_FOR_REMINDER } },
  });

  for (const user of usersWithStreak) {
    const todayCheckin = await prisma.checkin.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: today },
        isLoan: false,
      },
    });

    if (!todayCheckin) {
      potentialBreaks.push({
        userId: user.id,
        qqNumber: user.qqNumber,
        nickname: user.nickname,
        currentStreak: user.streakDays,
      });
    }
  }

  return potentialBreaks;
}

// 每日 0 点结算：扫所有 streakDays >= 1 的用户，昨天没打卡的全部清零。
// 返回被清零的用户列表（其中 streakDays >= MIN_STREAK_FOR_REMINDER 的会被通知）
async function settleStreaks(): Promise<{
  userId: number;
  qqNumber: string;
  nickname: string;
  brokenStreak: number;
}[]> {
  const yesterdayStart = getYesterdayStart();
  const todayStart = getTodayStart();
  const broken: { userId: number; qqNumber: string; nickname: string; brokenStreak: number }[] = [];

  const usersWithStreak = await prisma.user.findMany({
    where: { streakDays: { gte: 1 } },
  });

  for (const user of usersWithStreak) {
    const yesterdayCheckin = await prisma.checkin.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: yesterdayStart, lt: todayStart },
        isLoan: false,
      },
    });

    if (!yesterdayCheckin) {
      broken.push({
        userId: user.id,
        qqNumber: user.qqNumber,
        nickname: user.nickname,
        brokenStreak: user.streakDays,
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { streakDays: 0 },
      });
    }
  }

  return broken;
}

// =====================================================
// 定时任务消息生成
// 优先级：AI（hermes + 用户最近 7 天打卡上下文）→ 失败回退到模板池
// =====================================================

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// 并发执行 fn，最多 concurrency 个同时运行；保留输入顺序
async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

// 同时 fork 几个 hermes Python 进程的上限（保护 CPU/内存）
const AI_CONCURRENCY = 3;

// ----- 模板兜底（AI 失败时使用）-----

function templateReminderMessage(qq: string): string {
  const messages = [
    `[CQ:at,qq=${qq}] 今天还没打卡哦！快来记录一下今天的学习/运动吧～ 💪`,
    `[CQ:at,qq=${qq}] 打卡时间到！今天学习/运动了吗？别忘了记录哦～ 📝`,
    `[CQ:at,qq=${qq}] 嘿！今天的打卡还没完成呢，加油！ ⏰`,
    `[CQ:at,qq=${qq}] 温馨提醒：今日打卡尚未完成～ 🔔`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function templateStreakWarningMessage(user: { qqNumber: string; currentStreak: number }): string {
  const messages = [
    `[CQ:at,qq=${user.qqNumber}] 你已经连续打卡 ${user.currentStreak} 天了！今天还没打卡哦，再不打卡连续记录就要断啦！💔`,
    `[CQ:at,qq=${user.qqNumber}] ${user.currentStreak} 天的努力要白费了？快来打卡！⏰`,
    `[CQ:at,qq=${user.qqNumber}] 连续 ${user.currentStreak} 天打卡，就差今天了！别让前功尽弃啊～ 🔥`,
    `[CQ:at,qq=${user.qqNumber}] 警告⚠️ 你的 ${user.currentStreak} 天连续打卡即将归零！快来拯救一下！`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function templateStreakBrokenMessage(user: { qqNumber: string; nickname: string; brokenStreak: number }): string {
  const messages = [
    `[CQ:at,qq=${user.qqNumber}] 啊哦～ ${user.brokenStreak} 天的连续打卡说没就没了！昨天竟然忘记打卡了？😱`,
    `[CQ:at,qq=${user.qqNumber}] 连续打卡 ${user.brokenStreak} 天，前功尽弃！就差一天你竟然断了？！💔`,
    `[CQ:at,qq=${user.qqNumber}] ${user.brokenStreak} 天的努力化为泡影～昨天摸鱼了？🐟`,
    `[CQ:at,qq=${user.qqNumber}] 破纪录了！连续 ${user.brokenStreak} 天打卡的记录保持到昨天为止～今天重新开始吧！🎯`,
    `[CQ:at,qq=${user.qqNumber}] ${user.nickname} 的 ${user.brokenStreak} 天连续打卡被重置了！昨天去哪了？👀`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// ----- AI 生成上下文 -----

interface RecentCheckinSummary {
  date: string;       // "MM-DD HH:mm" 北京时间
  duration: number;
  content: string;
  subcategory: string | null;
}

interface UserContextForAI {
  nickname: string;
  qqNumber: string;
  aiStyle: string;
  streakDays: number;
  maxStreak: number;
  recentCheckins: RecentCheckinSummary[];
  totalMinutesRecent: number;
}

async function getUserContextForAI(userId: number, days: number = 7): Promise<UserContextForAI | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const since = dayjs().tz(APP_TZ).subtract(days, 'day').startOf('day').toDate();
  const checkins = await prisma.checkin.findMany({
    where: { userId, createdAt: { gte: since }, isLoan: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return {
    nickname: user.nickname,
    qqNumber: user.qqNumber,
    aiStyle: user.aiStyle || 'encourage',
    streakDays: user.streakDays,
    maxStreak: user.maxStreak,
    recentCheckins: checkins.map(c => ({
      date: dayjs(c.createdAt).tz(APP_TZ).format('MM-DD HH:mm'),
      duration: c.duration,
      content: c.content,
      subcategory: c.subcategory,
    })),
    totalMinutesRecent: checkins.reduce((sum, c) => sum + c.duration, 0),
  };
}

function formatRecentCheckins(items: RecentCheckinSummary[]): string {
  if (items.length === 0) return '（最近无打卡记录）';
  return items
    .slice(0, 10)
    .map(c => `- ${c.date} [${c.subcategory || '其他'}] ${c.duration}分钟：${c.content}`)
    .join('\n');
}

// 确保 AI 生成的消息包含 @ 标签；缺失则前置补上
function ensureAtTag(text: string, qq: string): string {
  if (text.includes(`[CQ:at,qq=${qq}]`)) return text;
  return `[CQ:at,qq=${qq}] ${text.trim()}`;
}

// ----- AI 生成：打卡督促 -----

async function generateReminderMessage(qq: string): Promise<string> {
  const fallback = templateReminderMessage(qq);
  try {
    const user = await prisma.user.findUnique({ where: { qqNumber: qq } });
    if (!user) return fallback;
    const ctx = await getUserContextForAI(user.id);
    if (!ctx) return fallback;

    const style = getAIStyle(ctx.aiStyle);
    const today = dayjs().tz(APP_TZ).format('YYYY-MM-DD');

    const userPrompt = `今天是北京时间 ${today}，需要给用户「${ctx.nickname}」发一条「今日打卡督促」消息。

用户信息：
- 当前连续打卡：${ctx.streakDays} 天（历史最长 ${ctx.maxStreak} 天）
- 最近 7 天总时长：${ctx.totalMinutesRecent} 分钟
- 最近打卡记录：
${formatRecentCheckins(ctx.recentCheckins)}

请生成一条该用户今天还没打卡的提醒消息。要求：
- 自然、个性化，结合最近打卡记录给出有温度的提醒
- 长度 30-60 字
- 不要包含 @ 标签（系统会自动添加）
- 只输出消息内容本身，不要解释、不要前缀`;

    const result = await callHermesAgent(style.systemPrompt, userPrompt, undefined, {
      scenario: 'reminder',
      callerQQ: qq,
      groupQQ: REMINDER_GROUP_ID || undefined,
    });
    if (!result || result.trim().length < 5) return fallback;
    return ensureAtTag(result.trim(), qq);
  } catch (err) {
    console.error('[ai:reminder] 失败，回退模板:', err);
    return fallback;
  }
}

// ----- AI 生成：断签警告（今天还没打，再不打就要断）-----

async function generateStreakWarningMessage(target: {
  userId: number;
  qqNumber: string;
  nickname: string;
  currentStreak: number;
}): Promise<string> {
  const fallback = templateStreakWarningMessage(target);
  try {
    const ctx = await getUserContextForAI(target.userId);
    if (!ctx) return fallback;

    const style = getAIStyle(ctx.aiStyle);
    const userPrompt = `用户「${ctx.nickname}」已经连续打卡 ${ctx.streakDays} 天，但今天还没打卡，再不打就要断签了。

最近打卡记录：
${formatRecentCheckins(ctx.recentCheckins)}

请生成一条针对该用户的「断签警告」消息。要求：
- 强调连续 ${ctx.streakDays} 天的努力即将白费
- 自然、个性化、有紧迫感
- 长度 30-60 字
- 不要包含 @ 标签（系统会自动添加）
- 只输出消息内容本身`;

    const result = await callHermesAgent(style.systemPrompt, userPrompt, undefined, {
      scenario: 'streak_warning',
      callerQQ: target.qqNumber,
      groupQQ: REMINDER_GROUP_ID || undefined,
    });
    if (!result || result.trim().length < 5) return fallback;
    return ensureAtTag(result.trim(), target.qqNumber);
  } catch (err) {
    console.error('[ai:streak-warning] 失败，回退模板:', err);
    return fallback;
  }
}

// ----- AI 生成：断签调侃（已经断了）-----

async function generateStreakBrokenMessage(target: {
  userId: number;
  qqNumber: string;
  nickname: string;
  brokenStreak: number;
}): Promise<string> {
  const fallback = templateStreakBrokenMessage(target);
  try {
    const ctx = await getUserContextForAI(target.userId);
    if (!ctx) return fallback;

    const style = getAIStyle(ctx.aiStyle);
    const userPrompt = `用户「${ctx.nickname}」连续打卡 ${target.brokenStreak} 天，但昨天没打卡，连续记录刚刚断了。

最近打卡记录：
${formatRecentCheckins(ctx.recentCheckins)}

请生成一条针对该用户的「断签调侃」消息。要求：
- 调侃 ${target.brokenStreak} 天连续记录的中断，可以略带遗憾或玩笑
- 结尾鼓励今天重新开始
- 自然、个性化
- 长度 30-60 字
- 不要包含 @ 标签（系统会自动添加）
- 只输出消息内容本身`;

    const result = await callHermesAgent(style.systemPrompt, userPrompt, undefined, {
      scenario: 'streak_broken',
      callerQQ: target.qqNumber,
      groupQQ: REMINDER_GROUP_ID || undefined,
    });
    if (!result || result.trim().length < 5) return fallback;
    return ensureAtTag(result.trim(), target.qqNumber);
  } catch (err) {
    console.error('[ai:streak-broken] 失败，回退模板:', err);
    return fallback;
  }
}

// =====================================================
// Cron handlers — 每个 handler 是单次执行的纯逻辑，由 node-cron 触发
// =====================================================

async function runDailyReminder(ws: WebSocket): Promise<void> {
  if (!SUPER_ADMIN_QQ || !REMINDER_GROUP_ID || !botEnabled) return;
  try {
    const hasCheckedIn = await checkAdminCheckin();
    if (hasCheckedIn) {
      console.log('[cron:reminder] 管理员今日已打卡，跳过');
      return;
    }
    const msg = await generateReminderMessage(SUPER_ADMIN_QQ);
    sendGroupMessage(ws, REMINDER_GROUP_ID, msg);
    console.log('[cron:reminder] 已发送打卡督促');
  } catch (err) {
    console.error('[cron:reminder] 失败:', err);
  }
}

async function runStreakWarning(ws: WebSocket): Promise<void> {
  if (!REMINDER_GROUP_ID || !botEnabled) return;
  try {
    const potentialBreaks = await checkPotentialStreakBreaks();
    if (potentialBreaks.length === 0) {
      console.log('[cron:streak-warning] 无需提醒');
      return;
    }
    // AI 调用并发跑（最多 AI_CONCURRENCY 个），保持每用户独立的 prompt + 输出
    const msgs = await pMap(potentialBreaks, generateStreakWarningMessage, AI_CONCURRENCY);
    // 发送阶段串行：1 秒间隔避免 NapCat 风控
    for (const msg of msgs) {
      sendGroupMessage(ws, REMINDER_GROUP_ID, msg);
      await sleep(1000);
    }
    console.log(`[cron:streak-warning] 已提醒 ${potentialBreaks.length} 人`);
  } catch (err) {
    console.error('[cron:streak-warning] 失败:', err);
  }
}

// 群周报：每周一 09:00 北京时间，汇总上周一到本周一的群整体打卡数据 + AI 总结
async function runWeeklyGroupReport(ws: WebSocket): Promise<void> {
  if (!REMINDER_GROUP_ID || !botEnabled) return;

  const weekEnd = dayjs().tz(APP_TZ).startOf('isoWeek').toDate();             // 本周一 00:00
  const weekStart = dayjs().tz(APP_TZ).startOf('isoWeek').subtract(7, 'day').toDate(); // 上周一 00:00

  try {
    const checkins = await prisma.checkin.findMany({
      where: { createdAt: { gte: weekStart, lt: weekEnd }, isLoan: false },
      include: { user: true },
    });

    if (checkins.length === 0) {
      console.log('[cron:weekly-report] 上周无打卡数据，跳过');
      return;
    }

    // 按用户聚合
    const userStats = new Map<number, { user: { nickname: string }; minutes: number; count: number }>();
    const categoryStats = new Map<string, number>();
    for (const c of checkins) {
      const stat = userStats.get(c.userId) || { user: { nickname: c.user.nickname }, minutes: 0, count: 0 };
      stat.minutes += c.duration;
      stat.count += 1;
      userStats.set(c.userId, stat);
      if (c.category) {
        categoryStats.set(c.category, (categoryStats.get(c.category) || 0) + c.duration);
      }
    }

    const topUsers = [...userStats.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 5);
    const totalMinutes = [...userStats.values()].reduce((s, u) => s + u.minutes, 0);
    const activeUserCount = userStats.size;

    // 拼模板部分（数据展示）
    const rangeLabel = `${dayjs(weekStart).tz(APP_TZ).format('MM/DD')} - ${dayjs(weekEnd)
      .subtract(1, 'day')
      .tz(APP_TZ)
      .format('MM/DD')}`;
    let message = `📅 群周报 (${rangeLabel})\n\n`;
    message += `📊 整体表现\n`;
    message += `├ 活跃用户: ${activeUserCount} 人\n`;
    message += `├ 总打卡: ${checkins.length} 次\n`;
    message += `└ 总时长: ${formatDuration(totalMinutes)}\n\n`;

    message += `🏆 本周 TOP\n`;
    topUsers.forEach((u, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      message += `${medal} ${u.user.nickname} ${formatDuration(u.minutes)} (${u.count}次)\n`;
    });

    if (categoryStats.size > 0) {
      message += `\n📚 分类分布\n`;
      const sortedCats = [...categoryStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      for (const [cat, minutes] of sortedCats) {
        const pct = Math.round((minutes / totalMinutes) * 100);
        message += `${cat} ${pct}% (${formatDuration(minutes)})\n`;
      }
    }

    // AI 总结
    const systemPrompt = `你是一个 QQ 打卡群的 AI 助手，擅长生成群周报总结。语气温暖、积极、有洞察力，可以适当用群友昵称表扬。`;
    const userPrompt = `本周（北京时间 ${rangeLabel}）群打卡数据：

整体：
- 活跃用户: ${activeUserCount} 人
- 总打卡次数: ${checkins.length}
- 总时长: ${totalMinutes} 分钟

TOP 用户:
${topUsers.map((u, i) => `${i + 1}. ${u.user.nickname} ${u.minutes}分钟 (${u.count}次)`).join('\n')}

分类分布:
${[...categoryStats.entries()].sort((a, b) => b[1] - a[1]).map(([cat, m]) => `- ${cat}: ${m}分钟`).join('\n') || '（无分类数据）'}

请生成一段 80-150 字的群周报总结：
- 表扬整体表现 + TOP 用户
- 提一个观察（如分类偏好、时长趋势）
- 给下周一个鼓励
- 语言自然连贯，不要列点
- 只输出总结正文`;

    const aiSummary = await callHermesAgent(systemPrompt, userPrompt, undefined, {
      scenario: 'group_weekly_report',
      groupQQ: REMINDER_GROUP_ID || undefined,
    });
    if (aiSummary && aiSummary.trim().length > 5) {
      message += `\n🤖 本周观察:\n${aiSummary.trim()}`;
    }

    sendGroupMessage(ws, REMINDER_GROUP_ID, message);
    console.log(`[cron:weekly-report] 已发送群周报（${activeUserCount} 人，${checkins.length} 次打卡）`);
  } catch (err) {
    console.error('[cron:weekly-report] 失败:', err);
  }
}

// 每日 0 点结算：清零昨日断签用户的 streakDays，并对原 streak >= 阈值的发"已断"通知
async function runStreakSettle(ws: WebSocket): Promise<void> {
  try {
    const broken = await settleStreaks();
    const announceable = broken.filter(u => u.brokenStreak >= MIN_STREAK_FOR_REMINDER);
    if (REMINDER_GROUP_ID && botEnabled && announceable.length > 0) {
      const msgs = await pMap(announceable, generateStreakBrokenMessage, AI_CONCURRENCY);
      for (const msg of msgs) {
        sendGroupMessage(ws, REMINDER_GROUP_ID, msg);
        await sleep(1000);
      }
    }
    console.log(`[cron:streak-settle] 清零 ${broken.length} 人，通知 ${announceable.length} 人`);
  } catch (err) {
    console.error('[cron:streak-settle] 失败:', err);
  }
}

// 注册所有定时任务到 node-cron。所有 cron 表达式都按北京时间解析，与服务器物理时区无关。
function registerCronJobs(ws: WebSocket): void {
  stopAllCronJobs();

  const opts = { timezone: APP_TZ } as const;

  // 每日 0:01 — 断签结算（清零 + 通知）
  cronJobs.push(cron.schedule('1 0 * * *', () => runStreakSettle(ws), opts));
  console.log(`[cron] 断签结算已注册：每天 00:01 (${APP_TZ})`);

  // 每日 0:05 — 每周前三头衔更新
  if (TITLE_GROUP_ID) {
    cronJobs.push(
      cron.schedule(
        '5 0 * * *',
        async () => {
          try {
            await updateWeeklyTopTitles(ws);
            console.log('[cron:weekly-title] 已更新');
          } catch (err) {
            console.error('[cron:weekly-title] 失败:', err);
          }
        },
        opts,
      ),
    );
    console.log(`[cron] 每周头衔已注册：每天 00:05 (${APP_TZ})`);
  }

  // 打卡督促 — 每天 REMINDER_HOUR:REMINDER_MINUTE（默认 19:00）
  if (SUPER_ADMIN_QQ && REMINDER_GROUP_ID) {
    cronJobs.push(
      cron.schedule(`${REMINDER_MINUTE} ${REMINDER_HOUR} * * *`, () => runDailyReminder(ws), opts),
    );
    console.log(
      `[cron] 打卡督促已注册：每天 ${REMINDER_HOUR}:${String(REMINDER_MINUTE).padStart(2, '0')} (${APP_TZ})`,
    );
  } else {
    console.log('[cron] 打卡督促未配置（需要 ADMIN_QQ 和 REMINDER_GROUP_ID）');
  }

  // 断签警告 — 每天 STREAK_WARNING_HOUR:STREAK_WARNING_MINUTE（默认 21:00）
  if (REMINDER_GROUP_ID) {
    cronJobs.push(
      cron.schedule(
        `${STREAK_WARNING_MINUTE} ${STREAK_WARNING_HOUR} * * *`,
        () => runStreakWarning(ws),
        opts,
      ),
    );
    console.log(
      `[cron] 断签警告已注册：每天 ${STREAK_WARNING_HOUR}:${String(STREAK_WARNING_MINUTE).padStart(2, '0')} (${APP_TZ})`,
    );
  }

  // 群周报 — 每周一 09:00（北京时间）
  if (REMINDER_GROUP_ID) {
    cronJobs.push(cron.schedule('0 9 * * 1', () => runWeeklyGroupReport(ws), opts));
    console.log(`[cron] 群周报已注册：每周一 09:00 (${APP_TZ})`);
  }

  console.log(`[cron] 共 ${cronJobs.length} 个定时任务已注册`);
}

function connectBot() {
  console.log(`QQ Bot ${VERSION} 启动中...`);
  console.log('正在连接 NapCat...');

  const ws = new WebSocket(WS_URL);

  ws.on('open', async () => {
    console.log('✅ 已连接到 NapCat');

    // 头衔系统：启动时立即跑一次（保证当天生效），之后由 cron 每日 0:05 更新
    if (TITLE_GROUP_ID) {
      try {
        await updateWeeklyTopTitles(ws);
        console.log('已初始化每周前三头衔');
      } catch (err) {
        console.error('初始化每周前三头衔失败:', err);
      }
    }

    // 注册所有定时任务（北京时间）
    registerCronJobs(ws);
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

      if (await handleClassificationCorrection(ws, event, cleanMessage)) {
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

        case '设置风格':
        case 'AI风格':
        case '风格':
        case '风格列表':
          await handleSetAIStyle(ws, event, args);
          break;

        case '周报':
        case '本周报告':
        case '我的周报':
          await handleWeeklyReport(ws, event);
          break;

        case 'ping':
          sendReply(ws, event, 'pong');
          break;

        case '测试模式':
        case 'test':
        case '测试':
          if (!isSuperAdmin) {
            sendReply(ws, event, '只有超级管理员才能切换测试模式');
            break;
          }
          // 切换测试模式
          testMode = !testMode;
          if (testMode) {
            sendReply(ws, event, '🧪 已开启测试模式\n\n所有打卡记录将不会保存到数据库，可用于测试 AI 分类等功能。\n\n发送「测试模式」可退出测试模式。');
            console.log('⚠️ 测试模式已开启');
          } else {
            sendReply(ws, event, '✅ 已关闭测试模式\n\n打卡记录将正常保存到数据库。');
            console.log('✅ 测试模式已关闭');
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

        case '撤销打卡':
        case '撤销':
        case '删除打卡':
          // 查询用户今天最后一条打卡记录
          const userToUndo = await prisma.user.findUnique({ where: { qqNumber: event.user_id!.toString() } });
          if (!userToUndo) {
            sendReply(ws, event, '你还没有注册哦！发送「我想打卡」开始使用～');
            break;
          }

          // 获取今天的最后一条打卡记录
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const lastCheckin = await prisma.checkin.findFirst({
            where: {
              userId: userToUndo.id,
              createdAt: { gte: todayStart }
            },
            orderBy: { createdAt: 'desc' }
          });

          if (!lastCheckin) {
            sendReply(ws, event, '❌ 你今天还没有打卡记录哦！');
            break;
          }

          // 删除这条打卡记录
          await prisma.checkin.delete({
            where: { id: lastCheckin.id }
          });

          const checkinType = lastCheckin.isLoan ? '贷款打卡' : '打卡';
          sendReply(
            ws,
            event,
            `✅ 已撤销最后一条${checkinType}记录:\n\n` +
            `📝 内容: ${lastCheckin.content}\n` +
            `⏱️ 时长: ${formatDuration(lastCheckin.duration)}\n` +
            `🕐 时间: ${lastCheckin.createdAt.toLocaleString('zh-CN', { timeZone: 'Australia/Melbourne' })}`
          );
          break;

        case '帮助':
        case 'help':
            let helpMsg = '📖 可用命令:\n\n' +
              '🆕 我想打卡/注册 - 新人注册\n\n' +
              '📝 打卡 [时长] [内容]\n' +
              '  例: 打卡 30分钟 学习TypeScript\n\n' +
              '💸 打卡 贷款 [时长] [内容]\n' +
              '  (正常打卡可抵消贷款)\n\n' +
              '🛠 分类纠错 - @机器人说“分类错了改成英语·听力”（仅修改上一条）\n\n' +
              '🔙 撤销打卡 - 撤销今日最后一条记录\n\n' +
              '📊 打卡记录 - 查看统计(含AI分析)\n' +
              '👀 查看打卡 @某人 - 查看他人记录\n' +
            '📅 周报 - 本周报告(含AI总结)\n' +
            '💰 负债/欠款 - 查看贷款负债\n' +
            '🎯 设置目标 [时长] - 每日目标\n' +
            '🎖️ 成就 - 查看成就列表\n\n' +
            '🏆 今日排行/周榜/总榜 - 排行榜\n' +
            '📈 群统计 - 查看群整体数据\n\n' +
            '💡 建议 [内容] - 提交功能建议';

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
    // 停掉所有 cron 任务，避免重连后重复注册
    stopAllCronJobs();
    setTimeout(connectBot, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket 错误:', err.message);
  });
}

// 优雅退出
process.on('SIGINT', async () => {
  console.log('\n正在关闭...');
  stopAllCronJobs();
  await prisma.$disconnect();
  process.exit(0);
});

connectBot();
