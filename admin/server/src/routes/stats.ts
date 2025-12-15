import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types';
import { success, error } from '../utils/response';
import { validate } from '../middleware/validator';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 获取今天、本周、本月的开始时间
function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getWeekStart(): Date {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1); // 周一为一周开始
  const monday = new Date(today.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getMonthStart(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

/**
 * GET /api/stats/overview
 * 获取总览统计
 */
router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const todayStart = getTodayStart();
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();

    const [
      totalUsers,
      totalCheckins,
      totalDuration,
      todayStats,
      weekStats,
      monthStats,
    ] = await Promise.all([
      // 总用户数
      prisma.user.count(),
      // 总打卡数
      prisma.checkin.count(),
      // 总时长
      prisma.checkin.aggregate({
        _sum: { duration: true },
      }),
      // 今日统计
      Promise.all([
        prisma.checkin.count({
          where: { createdAt: { gte: todayStart } },
        }),
        prisma.checkin.aggregate({
          where: { createdAt: { gte: todayStart } },
          _sum: { duration: true },
        }),
        prisma.checkin.findMany({
          where: { createdAt: { gte: todayStart } },
          distinct: ['userId'],
          select: { userId: true },
        }),
      ]),
      // 本周统计
      Promise.all([
        prisma.checkin.count({
          where: { createdAt: { gte: weekStart } },
        }),
        prisma.checkin.aggregate({
          where: { createdAt: { gte: weekStart } },
          _sum: { duration: true },
        }),
        prisma.checkin.findMany({
          where: { createdAt: { gte: weekStart } },
          distinct: ['userId'],
          select: { userId: true },
        }),
      ]),
      // 本月统计
      Promise.all([
        prisma.checkin.count({
          where: { createdAt: { gte: monthStart } },
        }),
        prisma.checkin.aggregate({
          where: { createdAt: { gte: monthStart } },
          _sum: { duration: true },
        }),
        prisma.checkin.findMany({
          where: { createdAt: { gte: monthStart } },
          distinct: ['userId'],
          select: { userId: true },
        }),
      ]),
    ]);

    return success(res, {
      totalUsers,
      totalCheckins,
      totalDuration: totalDuration._sum.duration || 0,
      today: {
        checkins: todayStats[0],
        duration: todayStats[1]._sum.duration || 0,
        users: todayStats[2].length,
      },
      thisWeek: {
        checkins: weekStats[0],
        duration: weekStats[1]._sum.duration || 0,
        users: weekStats[2].length,
      },
      thisMonth: {
        checkins: monthStats[0],
        duration: monthStats[1]._sum.duration || 0,
        users: monthStats[2].length,
      },
    });
  } catch (err: any) {
    console.error('获取总览统计失败:', err);
    return error(res, '获取总览统计失败', 500);
  }
});

// 趋势查询参数验证
const trendQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).optional(),
  limit: z.string().optional(),
});

/**
 * GET /api/stats/trend
 * 获取打卡趋势数据
 */
router.get(
  '/trend',
  validate(trendQuerySchema, 'query'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { period = 'day', limit = '30' } = req.query;
      const limitNum = parseInt(limit as string);

      // 计算日期范围
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - limitNum);
      startDate.setHours(0, 0, 0, 0);

      // 获取所有打卡记录
      const checkins = await prisma.checkin.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          createdAt: true,
          duration: true,
          userId: true,
        },
      });

      // 按日期分组统计
      const trendMap = new Map<string, { checkins: number; duration: number; users: Set<number> }>();

      checkins.forEach((checkin) => {
        const date = new Date(checkin.createdAt);
        date.setHours(0, 0, 0, 0);
        const dateKey = date.toISOString().split('T')[0];

        if (!trendMap.has(dateKey)) {
          trendMap.set(dateKey, { checkins: 0, duration: 0, users: new Set() });
        }

        const stats = trendMap.get(dateKey)!;
        stats.checkins++;
        stats.duration += checkin.duration;
        stats.users.add(checkin.userId);
      });

      // 转换为数组并排序
      const trendData = Array.from(trendMap.entries())
        .map(([date, stats]) => ({
          date,
          checkins: stats.checkins,
          duration: stats.duration,
          users: stats.users.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return success(res, {
        period,
        data: trendData,
      });
    } catch (err: any) {
      console.error('获取趋势数据失败:', err);
      return error(res, '获取趋势数据失败', 500);
    }
  }
);

// 分类统计查询参数验证
const categoryQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /api/stats/category
 * 获取分类统计
 */
router.get(
  '/category',
  validate(categoryQuerySchema, 'query'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query;

      // 构建查询条件
      const where: any = {
        category: { not: null },
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }

      // 一级分类统计
      const categories = await prisma.checkin.groupBy({
        by: ['category'],
        where,
        _count: { id: true },
        _sum: { duration: true },
      });

      // 计算总数用于百分比
      const total = categories.reduce((sum, c) => sum + c._count.id, 0);

      const categoryStats = categories
        .filter((c) => c.category)
        .map((c) => ({
          category: c.category!,
          count: c._count.id,
          duration: c._sum.duration || 0,
          percentage: total > 0 ? Math.round((c._count.id / total) * 100) : 0,
        }));

      // 二级分类统计
      const subcategories = await prisma.checkin.groupBy({
        by: ['category', 'subcategory'],
        where: { ...where, subcategory: { not: null } },
        _count: { id: true },
        _sum: { duration: true },
      });

      const subcategoryStats = subcategories
        .filter((s) => s.subcategory)
        .map((s) => ({
          category: s.category!,
          subcategory: s.subcategory!,
          count: s._count.id,
          duration: s._sum.duration || 0,
          percentage: total > 0 ? Math.round((s._count.id / total) * 100) : 0,
        }));

      return success(res, {
        categories: categoryStats,
        subcategories: subcategoryStats,
      });
    } catch (err: any) {
      console.error('获取分类统计失败:', err);
      return error(res, '获取分类统计失败', 500);
    }
  }
);

// 排行榜查询参数验证
const leaderboardQuerySchema = z.object({
  period: z.enum(['today', 'week', 'month', 'all']).optional(),
  limit: z.string().optional(),
});

/**
 * GET /api/stats/leaderboard
 * 获取排行榜
 */
router.get(
  '/leaderboard',
  validate(leaderboardQuerySchema, 'query'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { period = 'week', limit = '10' } = req.query;
      const limitNum = parseInt(limit as string);

      // 确定时间范围
      let startDate: Date | undefined;
      if (period === 'today') {
        startDate = getTodayStart();
      } else if (period === 'week') {
        startDate = getWeekStart();
      } else if (period === 'month') {
        startDate = getMonthStart();
      }

      // 构建查询条件
      const where: any = { isLoan: false };
      if (startDate) {
        where.createdAt = { gte: startDate };
      }

      // 获取所有打卡记录并按用户分组
      const checkins = await prisma.checkin.findMany({
        where,
        select: {
          userId: true,
          duration: true,
          user: {
            select: {
              qqNumber: true,
              nickname: true,
              streakDays: true,
            },
          },
        },
      });

      // 按用户统计
      const userStats = new Map<
        number,
        { qqNumber: string; nickname: string; checkins: number; duration: number; streakDays: number }
      >();

      checkins.forEach((checkin) => {
        if (!userStats.has(checkin.userId)) {
          userStats.set(checkin.userId, {
            qqNumber: checkin.user.qqNumber,
            nickname: checkin.user.nickname,
            checkins: 0,
            duration: 0,
            streakDays: checkin.user.streakDays,
          });
        }

        const stats = userStats.get(checkin.userId)!;
        stats.checkins++;
        stats.duration += checkin.duration;
      });

      // 转换为数组并排序（按时长降序）
      const leaderboard = Array.from(userStats.entries())
        .map(([userId, stats], index) => ({
          rank: 0, // 稍后赋值
          userId,
          qqNumber: stats.qqNumber,
          nickname: stats.nickname,
          checkins: stats.checkins,
          duration: stats.duration,
          streakDays: stats.streakDays,
        }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, limitNum)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
        }));

      return success(res, {
        period,
        leaderboard,
      });
    } catch (err: any) {
      console.error('获取排行榜失败:', err);
      return error(res, '获取排行榜失败', 500);
    }
  }
);

export default router;
