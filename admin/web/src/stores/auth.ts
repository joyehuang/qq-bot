import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login as apiLogin, verifyToken } from '@/api/auth';
import type { LoginRequest } from '@/types';

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string>(localStorage.getItem('token') || '');
  const username = ref<string>(localStorage.getItem('username') || '');

  // Getters
  const isLoggedIn = computed(() => !!token.value);

  // Actions
  async function login(credentials: LoginRequest) {
    const response = await apiLogin(credentials);

    token.value = response.token;
    username.value = response.username;

    // 保存到 localStorage
    localStorage.setItem('token', response.token);
    localStorage.setItem('username', response.username);

    return response;
  }

  async function checkAuth() {
    if (!token.value) {
      return false;
    }

    try {
      const response = await verifyToken();
      return response.valid;
    } catch (error) {
      logout();
      return false;
    }
  }

  function logout() {
    token.value = '';
    username.value = '';
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  }

  return {
    // State
    token,
    username,
    // Getters
    isLoggedIn,
    // Actions
    login,
    checkAuth,
    logout,
  };
});
