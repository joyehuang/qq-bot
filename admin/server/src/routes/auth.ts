import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ENV } from '../config/env';
import { generateToken, verifyToken } from '../utils/jwt';
import { success, error } from '../utils/response';
import { validate } from '../middleware/validator';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// 登录请求参数验证
const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

/**
 * POST /api/auth/login
 * 管理员登录
 */
router.post('/login', validate(loginSchema), (req: Request, res: Response) => {
  const { username, password } = req.body;

  // 验证用户名和密码
  if (username !== ENV.ADMIN_USERNAME || password !== ENV.ADMIN_PASSWORD) {
    return error(res, '用户名或密码错误', 401, 'INVALID_CREDENTIALS');
  }

  // 生成 JWT Token
  const token = generateToken({ username });

  return success(res, {
    token,
    expiresIn: 604800, // 7 天（秒）
    username,
  });
});

/**
 * POST /api/auth/verify
 * 验证 Token 是否有效
 */
router.post('/verify', authMiddleware, (req: AuthRequest, res: Response) => {
  return success(res, {
    valid: true,
    username: req.user?.username,
  });
});

export default router;
