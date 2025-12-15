import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../types';
import { success, successPaginated, error } from '../utils/response';
import { parsePagination, parseSort } from '../utils/pagination';
import { validate } from '../middleware/validator';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 获取打卡列表查询参数验证
const listQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  isLoan: z.enum(['true', 'false']).optional(),
  keyword: z.string().optional(),
  sortBy: z.enum(['createdAt', 'duration']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * GET /api/checkins
 * 获取打卡记录列表（分页、筛选、搜索）
 */
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page,
        pageSize,
        userId,
        startDate,
        endDate,
        category,
        isLoan,
        keyword,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      // 解析分页参数
      const pagination = parsePagination(page as string, pageSize as string);

      // 构建查询条件
      const where: any = {};

      if (userId) {
        where.userId = parseInt(userId as string);
      }

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

      if (category) {
        where.category = category;
      }

      if (isLoan) {
        where.isLoan = isLoan === 'true';
      }

      if (keyword) {
        where.content = {
          contains: keyword as string,
        };
      }

      // 获取总数
      const total = await prisma.checkin.count({ where });

      // 获取打卡记录
      const checkins = await prisma.checkin.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: {
          [sortBy as string]: sortOrder,
        },
        include: {
          user: {
            select: {
              id: true,
              qqNumber: true,
              nickname: true,
            },
          },
        },
      });

      return successPaginated(res, checkins, total, pagination.page, pagination.pageSize);
    } catch (err: any) {
      console.error('获取打卡记录失败:', err);
      return error(res, '获取打卡记录失败', 500);
    }
  }
);

/**
 * GET /api/checkins/:id
 * 获取单条打卡记录详情
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const checkin = await prisma.checkin.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            id: true,
            qqNumber: true,
            nickname: true,
            streakDays: true,
            aiStyle: true,
          },
        },
      },
    });

    if (!checkin) {
      return error(res, '打卡记录不存在', 404, 'NOT_FOUND');
    }

    return success(res, checkin);
  } catch (err: any) {
    console.error('获取打卡记录详情失败:', err);
    return error(res, '获取打卡记录详情失败', 500);
  }
});

/**
 * DELETE /api/checkins/:id
 * 删除打卡记录
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 检查记录是否存在
    const checkin = await prisma.checkin.findUnique({
      where: { id: parseInt(id) },
    });

    if (!checkin) {
      return error(res, '打卡记录不存在', 404, 'NOT_FOUND');
    }

    // 删除记录
    await prisma.checkin.delete({
      where: { id: parseInt(id) },
    });

    return success(res, { message: '删除成功' });
  } catch (err: any) {
    console.error('删除打卡记录失败:', err);
    return error(res, '删除打卡记录失败', 500);
  }
});

/**
 * GET /api/checkins/export
 * 导出打卡记录为 CSV
 */
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, userId, category } = req.query;

    // 构建查询条件
    const where: any = {};

    if (userId) {
      where.userId = parseInt(userId as string);
    }

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

    if (category) {
      where.category = category;
    }

    // 获取所有符合条件的打卡记录
    const checkins = await prisma.checkin.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            qqNumber: true,
            nickname: true,
          },
        },
      },
    });

    // 生成 CSV
    const csvHeader = 'ID,用户,QQ号,内容,时长(分钟),是否贷款,分类,子分类,日期\n';
    const csvRows = checkins.map((c) => {
      return [
        c.id,
        c.user.nickname,
        c.user.qqNumber,
        `"${c.content.replace(/"/g, '""')}"`, // 转义双引号
        c.duration,
        c.isLoan ? '是' : '否',
        c.category || '',
        c.subcategory || '',
        new Date(c.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      ].join(',');
    });

    const csv = csvHeader + csvRows.join('\n');

    // 设置响应头
    const filename = `checkins_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // 添加 UTF-8 BOM，确保 Excel 正确显示中文
    res.write('\uFEFF');
    res.write(csv);
    res.end();
  } catch (err: any) {
    console.error('导出CSV失败:', err);
    return error(res, '导出失败', 500);
  }
});

export default router;
