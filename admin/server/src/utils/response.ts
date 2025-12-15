import { Response } from 'express';
import { ApiResponse, PaginatedResponse } from '../types';

/**
 * 成功响应
 */
export function success<T>(res: Response, data: T, statusCode = 200): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  return res.status(statusCode).json(response);
}

/**
 * 分页成功响应
 */
export function successPaginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  pageSize: number
): Response {
  const response: ApiResponse<PaginatedResponse<T>> = {
    success: true,
    data: {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
  return res.status(200).json(response);
}

/**
 * 错误响应
 */
export function error(
  res: Response,
  message: string,
  statusCode = 500,
  code?: string
): Response {
  const response: ApiResponse = {
    success: false,
    error: {
      message,
      code,
    },
  };
  return res.status(statusCode).json(response);
}
