import { post } from '@/utils/http';
import type { LoginRequest, LoginResponse } from '@/types';

/**
 * 登录
 */
export function login(data: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', data);
}

/**
 * 验证 Token
 */
export function verifyToken(): Promise<{ valid: boolean; username: string }> {
  return post<{ valid: boolean; username: string }>('/auth/verify');
}
