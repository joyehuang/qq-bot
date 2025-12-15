import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { error } from '../utils/response';

/**
 * Zod 验证中间件工厂函数
 * @param schema - Zod schema
 * @param source - 验证数据来源 ('body' | 'query' | 'params')
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    try {
      const data = req[source];
      schema.parse(data);
      next();
    } catch (err: any) {
      if (err.name === 'ZodError') {
        const firstError = err.errors[0];
        return error(
          res,
          `${firstError.path.join('.')}: ${firstError.message}`,
          400,
          'VALIDATION_ERROR'
        );
      }
      return error(res, '参数验证失败', 400, 'VALIDATION_ERROR');
    }
  };
}
