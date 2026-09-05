import {createApp} from 'vue';
import App from './App.vue';
import {useEmailStore} from '@/store/email.js';
import {endSession} from '@/utils/session.js';
import router from './router';
import './style.css';
import './style-win95.css';
import { init } from '@/init/init.js';
import { createPinia } from 'pinia';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import perm from "@/perm/perm.js";
const pinia = createPinia().use(piniaPersistedState)
import i18n from "@/i18n/index.js";
const app = createApp(App, { initialize: async () => {
    await init()
    app.use(router)
    await router.isReady()
} }).use(pinia).use(i18n).directive('perm',perm)
useEmailStore(pinia)
window.addEventListener('storage', event => {
    if (event.key === 'token' || event.key === null) {
        useEmailStore(pinia).resetSession()
        if (!localStorage.getItem('token')) void endSession()
        else location.reload()
    }
})
app.config.devtools = true;

app.mount('#app');
