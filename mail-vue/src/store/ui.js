import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
    state: () => ({
        asideShow: window.innerWidth > 1024,
        accountShow: false,
        backgroundLoading: true,
        changeNotice: 0,
        writerRef: null,
        changePreview: 0,
        previewData: {},
        key: 0,
        dark: false,
        /* 默认主题：Win95 复古模式（老用户由 index.html 的一次性迁移脚本切换） */
        win95: true,
        prevDark: false,
        readingPane: true,
        splitReader: false,
        mailListWidth: 380,
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
    }),
    actions: {
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        }
    },
    persist: {
        pick: ['accountShow','dark','win95','prevDark','readingPane','mailListWidth'],
    },
})
