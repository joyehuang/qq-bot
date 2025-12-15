import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { verifyToken } from '../utils/jwt';
import { error } from '../utils/response';

/**
 * JWT 认证中间件
 */
export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void | Response {
  try {
    // 从请求头获取 Token
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return error(res, '未提供认证令牌', 401, 'NO_TOKEN');
    }

    // 解析 Bearer Token
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return error(res, '认证令牌格式错误', 401, 'INVALID_TOKEN_FORMAT');
    }

    // 验证 Token
    const payload = verifyToken(token);

    if (!payload) {
      return error(res, '认证令牌无效或已过期', 401, 'INVALID_TOKEN');
    }

    // 将用户信息附加到请求对象
    req.user = payload;

    next();
  } catch (err) {
    return error(res, '认证失败', 401, 'AUTH_FAILED');
  }
}
