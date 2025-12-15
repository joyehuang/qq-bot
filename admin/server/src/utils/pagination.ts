import { PaginationParams } from '../types';

/**
 * 解析分页参数
 */
export function parsePagination(
  page?: string | number,
  pageSize?: string | number
): { page: number; pageSize: number; skip: number; take: number } {
  const parsedPage = Math.max(1, parseInt(String(page || 1)));
  const parsedPageSize = Math.min(100, Math.max(1, parseInt(String(pageSize || 20))));

  return {
    page: parsedPage,
    pageSize: parsedPageSize,
    skip: (parsedPage - 1) * parsedPageSize,
    take: parsedPageSize,
  };
}

/**
 * 解析排序参数
 */
export function parseSort(
  sortBy?: string,
  sortOrder?: string
): { orderBy: Record<string, 'asc' | 'desc'> } | undefined {
  if (!sortBy) return undefined;

  const order = sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';

  return {
    orderBy: {
      [sortBy]: order,
    },
  };
}
