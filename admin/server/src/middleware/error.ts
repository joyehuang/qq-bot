import { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env';

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): Response {
  console.error('错误:', err);

  // Zod 验证错误
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: {
        message: '请求参数验证失败',
        code: 'VALIDATION_ERROR',
        details: err.errors,
      },
    });
  }

  // 自定义错误
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  // 默认错误
  return res.status(500).json({
    success: false,
    error: {
      message: ENV.NODE_ENV === 'development' ? err.message : '服务器内部错误',
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
}

/**
 * 404 错误处理
 */
export function notFoundHandler(req: Request, res: Response): Response {
  return res.status(404).json({
    success: false,
    error: {
      message: '请求的资源不存在',
      code: 'NOT_FOUND',
    },
  });
}
