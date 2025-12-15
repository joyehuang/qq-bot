import { Request } from 'express';

// 扩展 Express Request 类型，添加用户信息
export interface AuthRequest extends Request {
  user?: {
    username: string;
  };
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

// 分页响应类型
export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 分页查询参数
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// 排序参数
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 日期范围参数
export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}
