import { defineStore } from 'pinia'
import {loginUserInfo} from "@/request/my.js";

export const useUserStore = defineStore('user', {
    state: () => ({
        user: {},
        refreshList: 0,
    }),
    actions: {
        refreshUserList() {
            loginUserInfo().then(user => {
                this.refreshList ++
            })
        },
        refreshUserInfo() {
            const token = localStorage.getItem('token')
            return loginUserInfo().then(user => {
                if (token === localStorage.getItem('token')) this.user = user
            }).catch(() => {})
        }
    }
})