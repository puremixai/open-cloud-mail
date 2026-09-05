import { getActivePinia } from 'pinia'
import router from '@/router'
import { useEmailStore } from '@/store/email.js'
import { useUserStore } from '@/store/user.js'
import { useAccountStore } from '@/store/account.js'
import { useWriterStore } from '@/store/writer.js'
import { userDraftStore } from '@/store/draft.js'
import { useUiStore } from '@/store/ui.js'

export function endSession(expectedToken = localStorage.getItem('token')) {
    if (expectedToken !== localStorage.getItem('token')) return
    localStorage.removeItem('token')
    localStorage.removeItem('email')
    sessionStorage.removeItem('email')
    if (getActivePinia()) {
        useEmailStore().resetSession()
        useUiStore().writerRef?.clearSession?.()
        useUserStore().$reset()
        useAccountStore().$reset()
        useWriterStore().$reset()
        userDraftStore().$reset()
    }
    return router.replace('/login')
}

export async function logoutSession() {
    const token = localStorage.getItem('token')
    try {
        const { logout } = await import('@/request/login.js')
        if (token === localStorage.getItem('token')) await logout()
    } finally {
        await endSession(token)
    }
}
