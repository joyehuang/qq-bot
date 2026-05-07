import { get } from '@/utils/http';
import type { AICallLog, AICallStats, PaginatedResponse } from '@/types';

export interface AICallListParams {
  page?: number;
  pageSize?: number;
  scenario?: string;
  status?: 'success' | 'error' | 'timeout';
  callerQQ?: string;
  groupQQ?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

export function getAICalls(params?: AICallListParams): Promise<PaginatedResponse<AICallLog>> {
  return get<PaginatedResponse<AICallLog>>('/ai-calls', { params });
}

export function getAICallDetail(id: number): Promise<AICallLog> {
  return get<AICallLog>(`/ai-calls/${id}`);
}

export function getAICallStats(): Promise<AICallStats> {
  return get<AICallStats>('/ai-calls/stats/overview');
}
