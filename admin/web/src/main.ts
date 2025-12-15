import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import router from './router';
import App from './App.vue';

// 导入样式
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/index.css';

const app = createApp(App);
const pinia = createPinia();

// 注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

// 使用插件
app.use(pinia);
app.use(router);
app.use(ElementPlus);

app.mount('#app');
