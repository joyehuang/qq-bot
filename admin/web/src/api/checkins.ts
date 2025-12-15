import { get, del } from '@/utils/http';
import { downloadFile } from '@/utils/http';
import type { Checkin, PaginatedResponse } from '@/types';

export interface CheckinListParams {
  page?: number;
  pageSize?: number;
  userId?: number;
  startDate?: string;
  endDate?: string;
  category?: string;
  isLoan?: boolean;
  keyword?: string;
  sortBy?: 'createdAt' | 'duration';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 获取打卡列表
 */
export function getCheckins(params?: CheckinListParams): Promise<PaginatedResponse<Checkin>> {
  return get<PaginatedResponse<Checkin>>('/checkins', { params });
}

/**
 * 获取打卡详情
 */
export function getCheckinDetail(id: number): Promise<Checkin> {
  return get<Checkin>(`/checkins/${id}`);
}

/**
 * 删除打卡
 */
export function deleteCheckin(id: number): Promise<{ message: string }> {
  return del<{ message: string }>(`/checkins/${id}`);
}

/**
 * 导出 CSV
 */
export function exportCheckins(params?: {
  startDate?: string;
  endDate?: string;
  userId?: number;
  category?: string;
}): Promise<void> {
  const queryString = new URLSearchParams(params as any).toString();
  const url = `/checkins/export/csv${queryString ? `?${queryString}` : ''}`;
  return downloadFile(url, `checkins_${new Date().toISOString().split('T')[0]}.csv`);
}
