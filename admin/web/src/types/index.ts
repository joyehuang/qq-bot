/**
 * API 响应基础类型
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * 分页响应类型
 */
export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 用户类型
 */
export interface User {
  id: number;
  qqNumber: string;
  nickname: string;
  dailyTarget: number;
  streakDays: number;
  aiStyle: number;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckinAt: string | null;
  debt: number;
  _count?: {
    checkins: number;
    achievements: number;
  };
  totalDuration?: number;
}

/**
 * 打卡记录类型
 */
export interface Checkin {
  id: number;
  userId: number;
  content: string;
  duration: number;
  category: string | null;
  subcategory: string | null;
  isLoan: boolean;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: number;
    qqNumber: string;
    nickname: string;
    streakDays?: number;
    aiStyle?: number;
  };
}

/**
 * 统计概览类型
 */
export interface StatsOverview {
  totalUsers: number;
  totalCheckins: number;
  totalDuration: number;
  today: {
    checkins: number;
    duration: number;
    users: number;
  };
  thisWeek: {
    checkins: number;
    duration: number;
    users: number;
  };
  thisMonth: {
    checkins: number;
    duration: number;
    users: number;
  };
}

/**
 * 趋势数据类型
 */
export interface TrendData {
  period: 'day' | 'week' | 'month';
  data: Array<{
    date: string;
    checkins: number;
    duration: number;
    users: number;
  }>;
}

/**
 * 分类统计类型
 */
export interface CategoryStats {
  categories: Array<{
    category: string;
    count: number;
    duration: number;
    percentage: number;
  }>;
  subcategories: Array<{
    category: string;
    subcategory: string;
    count: number;
    duration: number;
    percentage: number;
  }>;
}

/**
 * 排行榜类型
 */
export interface Leaderboard {
  period: 'today' | 'week' | 'month' | 'all';
  leaderboard: Array<{
    rank: number;
    userId: number;
    qqNumber: string;
    nickname: string;
    checkins: number;
    duration: number;
    streakDays: number;
  }>;
}

/**
 * 登录请求类型
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 登录响应类型
 */
export interface LoginResponse {
  token: string;
  expiresIn: number;
  username: string;
}

/**
 * 用户详情类型
 */
export interface UserDetail extends User {
  stats: {
    totalDuration: number;
    totalCheckins: number;
    averageDuration: number;
    categoryBreakdown: Record<string, number>;
  };
  recentCheckins: Checkin[];
}
