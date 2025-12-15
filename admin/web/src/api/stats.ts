import { get } from '@/utils/http';
import type { StatsOverview, TrendData, CategoryStats, Leaderboard } from '@/types';

/**
 * 获取总览统计
 */
export function getStatsOverview(): Promise<StatsOverview> {
  return get<StatsOverview>('/stats/overview');
}

/**
 * 获取趋势数据
 */
export function getStatsTrend(params?: {
  period?: 'day' | 'week' | 'month';
  limit?: number;
}): Promise<TrendData> {
  return get<TrendData>('/stats/trend', { params });
}

/**
 * 获取分类统计
 */
export function getStatsCategory(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<CategoryStats> {
  return get<CategoryStats>('/stats/category', { params });
}

/**
 * 获取排行榜
 */
export function getLeaderboard(params?: {
  period?: 'today' | 'week' | 'month' | 'all';
  limit?: number;
}): Promise<Leaderboard> {
  return get<Leaderboard>('/stats/leaderboard', { params });
}
