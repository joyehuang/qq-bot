import { get } from '@/utils/http';
import type { User, UserDetail, PaginatedResponse, Checkin } from '@/types';

export interface UserListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sortBy?: 'createdAt' | 'streakDays';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 获取用户列表
 */
export function getUsers(params?: UserListParams): Promise<PaginatedResponse<User>> {
  return get<PaginatedResponse<User>>('/users', { params });
}

/**
 * 获取用户详情
 */
export function getUserDetail(id: number): Promise<UserDetail> {
  return get<UserDetail>(`/users/${id}`);
}

/**
 * 获取用户打卡记录
 */
export function getUserCheckins(
  id: number,
  params?: { page?: number; pageSize?: number }
): Promise<PaginatedResponse<Checkin>> {
  return get<PaginatedResponse<Checkin>>(`/users/${id}/checkins`, { params });
}
