import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const useAppStore = defineStore('app', () => {
  // State
  const isDark = ref<boolean>(localStorage.getItem('theme') === 'dark');
  const sidebarCollapsed = ref<boolean>(localStorage.getItem('sidebarCollapsed') === 'true');

  // 监听暗色模式变化
  watch(
    isDark,
    (newValue) => {
      const html = document.documentElement;
      if (newValue) {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    },
    { immediate: true }
  );

  // 监听侧边栏折叠状态
  watch(sidebarCollapsed, (newValue) => {
    localStorage.setItem('sidebarCollapsed', String(newValue));
  });

  // Actions
  function toggleDark() {
    isDark.value = !isDark.value;
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function setSidebarCollapsed(collapsed: boolean) {
    sidebarCollapsed.value = collapsed;
  }

  return {
    // State
    isDark,
    sidebarCollapsed,
    // Actions
    toggleDark,
    toggleSidebar,
    setSidebarCollapsed,
  };
});
