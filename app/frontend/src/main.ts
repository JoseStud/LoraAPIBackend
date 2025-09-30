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

const bootstrap = async () => {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  const settingsStore = useSettingsStore(pinia);

  try {
    await settingsStore.loadSettings();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to preload frontend settings', error);
    }
  }

  app.mount('#app');
};

void bootstrap();
