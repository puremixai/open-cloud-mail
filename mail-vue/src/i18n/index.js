import { createI18n } from 'vue-i18n';
import en from './en.js'
import zh from './zh.js'
import { zh as commonZh, en as commonEn } from './ux-common.js'
import { zh as mailZh, en as mailEn } from './ux-mail.js'
import { zh as composeZh, en as composeEn } from './ux-compose.js'
const i18n = createI18n({
    legacy: false,
    messages: {
        zh: { ...zh, ux: { ...commonZh, ...mailZh, ...composeZh } },
        en: { ...en, ux: { ...commonEn, ...mailEn, ...composeEn } }
    },
});

export default i18n;
