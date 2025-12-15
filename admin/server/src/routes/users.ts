import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types';
import { success, successPaginated, error } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { validate } from '../middleware/validator';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 获取用户列表查询参数验证
const listQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  keyword: z.string().optional(),
  sortBy: z.enum(['createdAt', 'streakDays']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * GET /api/users
 * 获取用户列表（分页、搜索）
 */
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page,
        pageSize,
        keyword,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      // 解析分页参数
      const pagination = parsePagination(page as string, pageSize as string);

      // 构建查询条件
      const where: any = {};

      if (keyword) {
        where.OR = [
          { nickname: { contains: keyword as string } },
          { qqNumber: { contains: keyword as string } },
        ];
      }

      // 获取总数
      const total = await prisma.user.count({ where });

      // 获取用户列表
      const users = await prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: {
          [sortBy as string]: sortOrder,
        },
        include: {
          _count: {
            select: {
              checkins: true,
              achievements: true,
            },
          },
        },
      });

      // 计算每个用户的总打卡时长
      const usersWithStats = await Promise.all(
        users.map(async (user) => {
          const totalDuration = await prisma.checkin.aggregate({
            where: {
              userId: user.id,
              isLoan: false, // 不统计贷款打卡
            },
            _sum: {
              duration: true,
            },
          });

          return {
            ...user,
            totalDuration: totalDuration._sum.duration || 0,
          };
        })
      );

      return successPaginated(
        res,
        usersWithStats,
        total,
        pagination.page,
        pagination.pageSize
      );
    } catch (err: any) {
      console.error('获取用户列表失败:', err);
      return error(res, '获取用户列表失败', 500);
    }
  }
);

/**
 * GET /api/users/:id
 * 获取用户详情
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            checkins: true,
            achievements: true,
          },
        },
      },
    });

    if (!user) {
      return error(res, '用户不存在', 404, 'NOT_FOUND');
    }

    // 获取用户统计数据
    const [totalDuration, avgDuration, categoryBreakdown, recentCheckins] = await Promise.all([
      // 总时长
      prisma.checkin.aggregate({
        where: { userId: user.id, isLoan: false },
        _sum: { duration: true },
      }),
      // 平均时长
      prisma.checkin.aggregate({
        where: { userId: user.id, isLoan: false },
        _avg: { duration: true },
      }),
      // 分类统计
      prisma.checkin.groupBy({
        by: ['category'],
        where: { userId: user.id, isLoan: false, category: { not: null } },
        _sum: { duration: true },
      }),
      // 最近打卡
      prisma.checkin.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          content: true,
          duration: true,
          category: true,
          subcategory: true,
          isLoan: true,
          createdAt: true,
        },
      }),
    ]);

    // 转换分类统计为对象
    const categoryBreakdownObj: Record<string, number> = {};
    categoryBreakdown.forEach((item) => {
      if (item.category) {
        categoryBreakdownObj[item.category] = item._sum.duration || 0;
      }
    });

    return success(res, {
      ...user,
      stats: {
        totalDuration: totalDuration._sum.duration || 0,
        totalCheckins: user._count.checkins,
        averageDuration: Math.round(avgDuration._avg.duration || 0),
        categoryBreakdown: categoryBreakdownObj,
      },
      recentCheckins,
    });
  } catch (err: any) {
    console.error('获取用户详情失败:', err);
    return error(res, '获取用户详情失败', 500);
  }
});

/**
 * GET /api/users/:id/checkins
 * 获取用户的打卡记录
 */
router.get('/:id/checkins', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { page, pageSize } = req.query;

    // 验证用户存在
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!user) {
      return error(res, '用户不存在', 404, 'NOT_FOUND');
    }

    // 解析分页参数
    const pagination = parsePagination(page as string, pageSize as string);

    // 获取总数
    const total = await prisma.checkin.count({
      where: { userId: parseInt(id) },
    });

    // 获取打卡记录
    const checkins = await prisma.checkin.findMany({
      where: { userId: parseInt(id) },
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
    });

    return successPaginated(res, checkins, total, pagination.page, pagination.pageSize);
  } catch (err: any) {
    console.error('获取用户打卡记录失败:', err);
    return error(res, '获取用户打卡记录失败', 500);
  }
});

export default router;
