import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types';
import { success, successPaginated, error } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { validate } from '../middleware/validator';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Asia/Shanghai = UTC+8 全年无 DST，直接做偏移即可。
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDayKey(date: Date): string {
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function todayShanghaiStart(): Date {
  const now = new Date();
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - SHANGHAI_OFFSET_MS);
}

function daysAgoShanghaiStart(days: number): Date {
  const t = todayShanghaiStart();
  return new Date(t.getTime() - days * 24 * 60 * 60 * 1000);
}

const listQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  scenario: z.string().optional(),
  status: z.enum(['success', 'error', 'timeout']).optional(),
  callerQQ: z.string().optional(),
  groupQQ: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  keyword: z.string().optional(),
});

/**
 * GET /api/ai-calls
 * 列表 + 筛选 + 分页
 */
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page,
        pageSize,
        scenario,
        status,
        callerQQ,
        groupQQ,
        startDate,
        endDate,
        keyword,
      } = req.query;

      const pagination = parsePagination(page as string, pageSize as string);

      const where: any = {};
      if (scenario) where.scenario = scenario;
      if (status) where.status = status;
      if (callerQQ) where.callerQQ = callerQQ;
      if (groupQQ) where.groupQQ = groupQQ;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }
      if (keyword) {
        // SQLite 不支持 mode: 'insensitive'，contains 已是模糊匹配
        const k = keyword as string;
        where.OR = [
          { userPrompt: { contains: k } },
          { responseText: { contains: k } },
          { systemPrompt: { contains: k } },
        ];
      }

      const total = await prisma.aICallLog.count({ where });
      const items = await prisma.aICallLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      });

      return successPaginated(res, items, total, pagination.page, pagination.pageSize);
    } catch (err: any) {
      console.error('获取 AI 调用列表失败:', err);
      return error(res, '获取 AI 调用列表失败', 500);
    }
  },
);

/**
 * GET /api/ai-calls/:id
 * 详情（前端列表里不全量展开 prompt/response，进详情页才看完整）
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return error(res, 'ID 非法', 400);
    const record = await prisma.aICallLog.findUnique({ where: { id } });
    if (!record) return error(res, '记录不存在', 404);
    return success(res, record);
  } catch (err: any) {
    console.error('获取 AI 调用详情失败:', err);
    return error(res, '获取 AI 调用详情失败', 500);
  }
});

/**
 * GET /api/ai-calls/stats/overview
 * 总览：今日 / 本周 / 全部 + 按 scenario / 按状态 / 14 天趋势
 */
router.get('/stats/overview', async (_req: AuthRequest, res: Response) => {
  try {
    const todayStart = todayShanghaiStart();
    const weekStart = daysAgoShanghaiStart(7);
    const fourteenDayStart = daysAgoShanghaiStart(14);

    const [
      total,
      todayCount,
      weekCount,
      allAgg,
      todayAgg,
      weekAgg,
      byScenario,
      byStatus,
      recentForTrend,
    ] = await Promise.all([
      prisma.aICallLog.count(),
      prisma.aICallLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.aICallLog.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.aICallLog.aggregate({
        _avg: { durationMs: true },
        _sum: { durationMs: true },
      }),
      prisma.aICallLog.aggregate({
        where: { createdAt: { gte: todayStart } },
        _avg: { durationMs: true },
      }),
      prisma.aICallLog.aggregate({
        where: { createdAt: { gte: weekStart } },
        _avg: { durationMs: true },
      }),
      prisma.aICallLog.groupBy({
        by: ['scenario'],
        where: { createdAt: { gte: weekStart } },
        _count: { _all: true },
        _avg: { durationMs: true },
      }),
      prisma.aICallLog.groupBy({
        by: ['status'],
        where: { createdAt: { gte: weekStart } },
        _count: { _all: true },
      }),
      prisma.aICallLog.findMany({
        where: { createdAt: { gte: fourteenDayStart } },
        select: { createdAt: true, status: true },
      }),
    ]);

    // 14 天逐日 trend：先填零再累加，避免空白日期缺失
    const trend: { date: string; total: number; success: number; error: number }[] = [];
    const trendMap = new Map<string, { total: number; success: number; error: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = daysAgoShanghaiStart(i);
      const key = shanghaiDayKey(d);
      trendMap.set(key, { total: 0, success: 0, error: 0 });
    }
    for (const r of recentForTrend) {
      const key = shanghaiDayKey(r.createdAt);
      const bucket = trendMap.get(key);
      if (!bucket) continue;
      bucket.total++;
      if (r.status === 'success') bucket.success++;
      else bucket.error++;
    }
    for (const [date, v] of trendMap.entries()) {
      trend.push({ date, ...v });
    }

    // success rate（本周）
    const weekSuccess = byStatus.find((s) => s.status === 'success')?._count._all ?? 0;
    const weekTotal = byStatus.reduce((acc, s) => acc + s._count._all, 0);
    const successRateWeek = weekTotal > 0 ? Math.round((weekSuccess / weekTotal) * 1000) / 10 : 0;

    return success(res, {
      total,
      today: {
        count: todayCount,
        avgDurationMs: Math.round(todayAgg._avg.durationMs ?? 0),
      },
      week: {
        count: weekCount,
        avgDurationMs: Math.round(weekAgg._avg.durationMs ?? 0),
        successRate: successRateWeek,
      },
      all: {
        avgDurationMs: Math.round(allAgg._avg.durationMs ?? 0),
        totalDurationMs: allAgg._sum.durationMs ?? 0,
      },
      byScenario: byScenario
        .map((s) => ({
          scenario: s.scenario,
          count: s._count._all,
          avgDurationMs: Math.round(s._avg.durationMs ?? 0),
        }))
        .sort((a, b) => b.count - a.count),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      trend,
    });
  } catch (err: any) {
    console.error('获取 AI 调用统计失败:', err);
    return error(res, '获取 AI 调用统计失败', 500);
  }
});

export default router;
