import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';
import { useCommunity } from './stores/community';
const pinia = createPinia();
createApp(App).use(pinia).use(router).mount('#app');
void useCommunity(pinia).initialize();
