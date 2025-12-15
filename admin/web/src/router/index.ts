import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/Index.vue'),
    meta: { requiresAuth: false, title: '登录' },
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@/components/layout/Index.vue'),
    meta: { requiresAuth: true },
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/Index.vue'),
        meta: { title: '数据概览', icon: 'DataAnalysis' },
      },
      {
        path: 'checkins',
        name: 'Checkins',
        component: () => import('@/views/checkins/Index.vue'),
        meta: { title: '打卡记录', icon: 'Calendar' },
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/users/Index.vue'),
        meta: { title: '用户管理', icon: 'User' },
      },
      {
        path: 'users/:id',
        name: 'UserDetail',
        component: () => import('@/views/users/Detail.vue'),
        meta: { title: '用户详情', hidden: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/dashboard',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  // 设置页面标题
  document.title = to.meta.title
    ? `${to.meta.title} - QQ Bot 管理后台`
    : 'QQ Bot 管理后台';

  // 检查是否需要认证
  const requiresAuth = to.meta.requiresAuth !== false;

  if (requiresAuth) {
    // 需要认证的页面
    if (!authStore.isLoggedIn) {
      // 未登录，跳转到登录页
      next({ name: 'Login', query: { redirect: to.fullPath } });
    } else {
      // 已登录，验证 token 是否有效
      const isValid = await authStore.checkAuth();
      if (isValid) {
        next();
      } else {
        // Token 无效，跳转到登录页
        next({ name: 'Login', query: { redirect: to.fullPath } });
      }
    }
  } else {
    // 不需要认证的页面
    if (to.name === 'Login' && authStore.isLoggedIn) {
      // 已登录用户访问登录页，跳转到首页
      next({ name: 'Dashboard' });
    } else {
      next();
    }
  }
});

export default router;
