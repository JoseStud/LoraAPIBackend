import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';

import './assets/css/styles.css';
import './assets/css/design-system.css';
import './assets/css/mobile-enhanced.css';
import './assets/css/loading-animations.css';
import './assets/css/accessibility.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');
