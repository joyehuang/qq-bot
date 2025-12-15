import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.locale('zh-cn');
dayjs.extend(relativeTime);

/**
 * 格式化时长（分钟 -> 小时/分钟）
 */
export function formatDuration(minutes: number): string {
  if (minutes === 0) return '0分钟';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}分钟`;
  }

  if (mins === 0) {
    return `${hours}小时`;
  }

  return `${hours}小时${mins}分钟`;
}

/**
 * 格式化日期时间
 */
export function formatDateTime(date: string | Date, format = 'YYYY-MM-DD HH:mm:ss'): string {
  return dayjs(date).format(format);
}

/**
 * 格式化日期
 */
export function formatDate(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/**
 * 格式化时间
 */
export function formatTime(date: string | Date): string {
  return dayjs(date).format('HH:mm:ss');
}

/**
 * 格式化相对时间（"3天前"）
 */
export function formatRelativeTime(date: string | Date): string {
  return dayjs(date).fromNow();
}

/**
 * 格式化数字（添加千分位）
 */
export function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, total: number, decimals = 0): string {
  if (total === 0) return '0%';
  const percent = (value / total) * 100;
  return `${percent.toFixed(decimals)}%`;
}

/**
 * 截断文本
 */
export function truncate(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + suffix;
}

/**
 * 获取文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;

    if (timeout) clearTimeout(timeout);

    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;

    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
