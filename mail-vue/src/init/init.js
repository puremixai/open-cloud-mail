import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import {useEmailStore, staleRequest} from '@/store/email.js';
import i18n from "@/i18n/index.js";

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();

    const token = localStorage.getItem('token');
    const epoch = useEmailStore().syncSession();
    if (!settingStore.lang) {
        let lang = navigator.language.split('-')[0]
        lang = lang === 'zh' ? lang : 'en'
        settingStore.lang = lang
    }

    i18n.global.locale.value = settingStore.lang

    let setting = null;

    if (token) {
        const userPromise = loginUserInfo().catch(e => {
            if (e?.code === 401 || e?.response?.status === 401) return null;
            throw e;
        });

        const [s, user] = await Promise.all([websiteConfig(), userPromise]);
        if (token !== localStorage.getItem('token')) {
            if (localStorage.getItem('token')) throw staleRequest();
            // A current-session 401 already cleared identity; the public shell can load.
            settingStore.settings = s;
            settingStore.domainList = s.domainList;
            return;
        }
        if (epoch !== useEmailStore().syncSession()) throw staleRequest();
        setting = s;
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        if (setting.title) {
            document.title = setting.title;
        }

        if (user) {
            accountStore.currentAccountId = user.account.accountId;
            accountStore.currentAccount = user.account;
            userStore.user = user;

            const routers = permsToRouter(user.permKeys);
            routers.forEach(routerData => {
                router.addRoute('layout', routerData);
            });
        }

    } else {
        setting = await websiteConfig();
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        if (setting.title) {
            document.title = setting.title;
        }
    }
}
