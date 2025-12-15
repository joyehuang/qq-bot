import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ElMessage } from 'element-plus';
import type { ApiResponse } from '@/types';

// 创建 axios 实例
const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
http.interceptors.request.use(
  (config) => {
    // 添加 token
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error: AxiosError) => {
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const { data } = response;

    // 如果是下载文件等特殊响应，直接返回
    if (response.config.responseType === 'blob') {
      return response;
    }

    // API 返回的标准格式
    if (data.success === false) {
      // 业务错误
      const errorMessage = data.error?.message || '请求失败';
      ElMessage.error(errorMessage);
      return Promise.reject(new Error(errorMessage));
    }

    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    // HTTP 错误
    let message = '请求失败';

    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          message = '未登录或登录已过期';
          // 清除 token 并跳转到登录页
          localStorage.removeItem('token');
          localStorage.removeItem('username');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          break;
        case 403:
          message = '没有权限访问';
          break;
        case 404:
          message = '请求的资源不存在';
          break;
        case 500:
          message = '服务器错误';
          break;
        default:
          message = data?.error?.message || `请求失败 (${status})`;
      }
    } else if (error.request) {
      message = '网络错误，请检查您的网络连接';
    } else {
      message = error.message || '请求配置错误';
    }

    ElMessage.error(message);
    return Promise.reject(error);
  }
);

/**
 * GET 请求
 */
export function get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return http.get<ApiResponse<T>>(url, config).then((res) => res.data.data as T);
}

/**
 * POST 请求
 */
export function post<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig
): Promise<T> {
  return http.post<ApiResponse<T>>(url, data, config).then((res) => res.data.data as T);
}

/**
 * PUT 请求
 */
export function put<T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig
): Promise<T> {
  return http.put<ApiResponse<T>>(url, data, config).then((res) => res.data.data as T);
}

/**
 * DELETE 请求
 */
export function del<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return http.delete<ApiResponse<T>>(url, config).then((res) => res.data.data as T);
}

/**
 * 下载文件
 */
export function downloadFile(url: string, filename?: string): Promise<void> {
  return http
    .get(url, {
      responseType: 'blob',
    })
    .then((response) => {
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;

      // 从响应头获取文件名，或使用提供的文件名
      const contentDisposition = response.headers['content-disposition'];
      let actualFilename = filename;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          actualFilename = decodeURIComponent(filenameMatch[1]);
        }
      }

      link.download = actualFilename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    });
}

export default http;
