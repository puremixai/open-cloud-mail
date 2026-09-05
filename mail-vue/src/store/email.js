import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { EmailUnreadEnum } from '@/enums/email-enum.js'
import { emailDetail } from '@/request/email.js'
import { allEmailDetail } from '@/request/all-email.js'
import { useAccountStore } from '@/store/account.js'
import { useUserStore } from '@/store/user.js'

export const staleRequest = () => new DOMException('Mail context changed', 'AbortError')
export const isCanceled = error => error?.name === 'AbortError' || error?.code === 'ERR_CANCELED'
const blankContent = () => ({ email: null, admin: false, delType: null, showStar: true, showReply: true, showUnread: false })
const TTL = 5 * 60 * 1000
const MAX_DETAILS = 30

export const useEmailStore = defineStore('email', () => {
    // Never persist mail bodies or signed capabilities.
    localStorage.removeItem('email')
    sessionStorage.removeItem('email')
    const account = useAccountStore()
    const user = useUserStore()
    const deleteIds = ref(0), cancelStarEmailId = ref(0), addStarEmailId = ref(0)
    const starScroll = shallowRef(null), emailScroll = shallowRef(null), sendScroll = shallowRef(null)
    const contentData = ref(blankContent())
    const detailMap = ref({})
    const generation = ref(0)
    const cache = new Map(), pending = new Map()
    const starMutations = new Map()
    let mutationVersion = 0
    let identity = ''
    const getIdentity = () => JSON.stringify([localStorage.getItem('token'), user.user?.userId, user.user?.email, account.currentAccountId, account.currentAccount?.allReceive])

    function resetSession() {
        for (const entry of pending.values()) entry.controller.abort()
        pending.clear()
        starMutations.clear()
        cache.clear()
        detailMap.value = {}
        contentData.value = blankContent()
        deleteIds.value = cancelStarEmailId.value = addStarEmailId.value = 0
        localStorage.removeItem('email')
        sessionStorage.removeItem('email')
        identity = getIdentity()
        generation.value++
    }
    function syncSession() {
        if (identity !== getIdentity()) resetSession()
        return generation.value
    }
    identity = getIdentity()
    watch(() => [user.user?.userId, user.user?.email, account.currentAccountId, account.currentAccount?.allReceive], syncSession, { flush: 'sync' })

    function prune() {
        for (const [key, entry] of cache) {
            if (entry.expires <= Date.now()) { cache.delete(key); delete detailMap.value[key] }
        }
        while (cache.size > MAX_DETAILS) {
            const key = cache.keys().next().value
            cache.delete(key)
            delete detailMap.value[key]
        }
    }
    async function ensureDetail(emailId, { admin = false, force = false } = {}) {
        const epoch = syncSession()
        if (!emailId) throw new Error('Missing email ID')
        const key = `${admin ? 'admin' : 'owned'}:${emailId}`
        prune()
        if (pending.has(key)) return pending.get(key).promise
        if (!force && cache.has(key)) {
            const entry = cache.get(key)
            cache.delete(key)
            cache.set(key, entry)
            return detailMap.value[key]
        }
        const controller = new AbortController()
        const entry = { controller }
        entry.promise = (async () => {
            try {
                const data = await (admin ? allEmailDetail : emailDetail)(emailId, { signal: controller.signal })
                if (epoch !== syncSession() || controller.signal.aborted) throw staleRequest()
                if (!data || String(data.emailId) !== String(emailId)) throw new Error('Invalid email detail')
                const detail = { ...data, ...entry.patch, attList: data.attList || [] }
                const current = contentData.value
                if (!admin && (detailMap.value[key]?.unread === EmailUnreadEnum.READ ||
                    (!current.admin && current.email?.emailId === emailId && current.email.unread === EmailUnreadEnum.READ))) {
                    detail.unread = EmailUnreadEnum.READ
                }
                detailMap.value[key] = detail
                cache.delete(key)
                cache.set(key, { expires: Date.now() + TTL })
                prune()
                return detailMap.value[key]
            } finally {
                if (pending.get(key) === entry) pending.delete(key)
            }
        })()
        pending.set(key, entry)
        return entry.promise
    }
    async function fetchList(request) {
        const epoch = syncSession()
        const data = await request(0)
        if (epoch !== syncSession()) throw staleRequest()
        return data
    }
    function toContentEmail(email) {
        syncSession()
        return { ...email, emailId: email?.emailId || 0, content: '', text: '', attList: [], recipient: email?.recipient || '[]' }
    }
    function updateEmail(emailId, patch, { admin = false } = {}) {
        const key = `${admin ? 'admin' : 'owned'}:${emailId}`
        const request = pending.get(key)
        if (request) request.patch = { ...request.patch, ...patch }
        if (detailMap.value[key]) Object.assign(detailMap.value[key], patch)
        if (contentData.value.admin === admin && contentData.value.email?.emailId === emailId) Object.assign(contentData.value.email, patch)
        if (!admin) for (const scroll of [emailScroll.value, starScroll.value, sendScroll.value]) {
            const item = scroll?.emailList?.find(e => e.emailId === emailId)
            if (item) Object.assign(item, patch)
        }
    }
    // Versions are shared by every list and the detail view. A superseded
    // request must not publish either its success side effects or its rollback.
    function beginStarMutation(emailId) {
        const epoch = syncSession()
        const mutation = { emailId: String(emailId), epoch, version: ++mutationVersion }
        starMutations.set(mutation.emailId, mutation.version)
        return mutation
    }
    function isCurrentStarMutation(mutation) {
        return mutation.epoch === syncSession() && starMutations.get(mutation.emailId) === mutation.version
    }
    function finishStarMutation(mutation) {
        if (starMutations.get(mutation.emailId) === mutation.version) starMutations.delete(mutation.emailId)
    }
    function invalidateDetail(emailIds) {
        for (const emailId of emailIds) for (const scope of ['admin', 'owned']) {
            starMutations.delete(String(emailId))
            const key = `${scope}:${emailId}`
            pending.get(key)?.controller.abort()
            pending.delete(key)
            cache.delete(key)
            delete detailMap.value[key]
        }
    }
    function markListRead(emailId) { updateEmail(emailId, { unread: EmailUnreadEnum.READ }) }
    return { deleteIds, cancelStarEmailId, addStarEmailId, starScroll, emailScroll, sendScroll, contentData, detailMap, generation,
        beginStarMutation, isCurrentStarMutation, finishStarMutation,
        ensureDetail, fetchList, toContentEmail, resetSession, syncSession, updateEmail, invalidateDetail, markListRead }
})
