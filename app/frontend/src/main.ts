import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import { useSettingsStore } from './stores/settings';
import './assets/css/styles.css';
import './assets/css/design-system.css';
import './assets/css/mobile-enhanced.css';
import './assets/css/loading-animations.css';
import './assets/css/accessibility.css';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

const bootstrap = () => {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  app.mount('#app');

  const settingsStore = useSettingsStore(pinia);
  void settingsStore.loadSettings().catch((error) => {
    if (import.meta.env.DEV) {
      console.warn('Failed to preload frontend settings', error);
    }
  });
};

bootstrap();
