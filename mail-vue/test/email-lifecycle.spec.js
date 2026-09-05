import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEmailStore } from '@/store/email.js'
import { useAccountStore } from '@/store/account.js'
import http from '@/axios/index.js'

vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn() } }))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.clearAllMocks() })
afterEach(() => vi.useRealTimers())

describe('mail data lifecycle', () => {
  it('fetches only the brief list', async () => {
    const request = vi.fn().mockResolvedValue({ list: [{ emailId: 1 }] })
    expect(await useEmailStore().fetchList(request)).toEqual({ list: [{ emailId: 1 }] })
    expect(request.mock.calls.map(args => args[0])).toEqual([0])
  })
  it('deduplicates detail reads and keeps admin and owned responses separate', async () => {
    const pending = deferred()
    http.get.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ emailId: 1, content: 'admin' })
    const store = useEmailStore()
    const first = store.ensureDetail(1)
    const second = store.ensureDetail(1)
    pending.resolve({ emailId: 1, content: 'owned', attList: [{ key: 'private/a', url: '/signed/a' }] })
    expect(await first).toEqual(await second)
    expect((await store.ensureDetail(1)).content).toBe('owned')
    expect((await store.ensureDetail(1, { admin: true })).content).toBe('admin')
    expect(http.get.mock.calls.map(args => args[0])).toEqual(['/email/detail', '/allEmail/detail'])
    expect((await store.ensureDetail(1)).attList[0]).toEqual({ key: 'private/a', url: '/signed/a' })
  })
  it('expires signed detail after five minutes and evicts the least recently used entry', async () => {
    vi.useFakeTimers()
    http.get.mockImplementation((_, { params }) => Promise.resolve({ emailId: params.emailId, content: String(Date.now()) }))
    const store = useEmailStore()
    const old = await store.ensureDetail(1)
    vi.advanceTimersByTime(300001)
    expect((await store.ensureDetail(1)).content).not.toBe(old.content)
    for (let id = 2; id <= 31; id++) await store.ensureDetail(id)
    expect(Object.keys(store.detailMap)).toHaveLength(30)
    const before = http.get.mock.calls.length
    await store.ensureDetail(1)
    expect(http.get.mock.calls.length).toBe(before + 1)
  })
  it('clears legacy persisted bodies and rejects pending responses after account changes', async () => {
    localStorage.setItem('email', JSON.stringify({ contentData: { email: { content: 'secret' } } }))
    const store = useEmailStore()
    expect(localStorage.getItem('email')).toBeNull()
    const pending = deferred()
    http.get.mockReturnValueOnce(pending.promise)
    const request = store.ensureDetail(7).catch(e => e)
    useAccountStore().currentAccountId = 9
    expect(http.get.mock.calls[0][1].signal.aborted).toBe(true)
    pending.resolve({ emailId: 7, content: 'old account' })
    expect((await request).name).toBe('AbortError')
    expect(store.contentData.email).toBeNull()
    expect(Object.keys(store.detailMap)).toHaveLength(0)
  })
  it('does not reuse pending details after a session token replacement', async () => {
    localStorage.setItem('token', 'old')
    const store = useEmailStore()
    const pending = deferred()
    http.get.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ emailId: 7, content: 'new' })
    const first = store.ensureDetail(7).catch(e => e)
    localStorage.setItem('token', 'new')
    expect((await store.ensureDetail(7)).content).toBe('new')
    pending.resolve({ emailId: 7, content: 'old' })
    expect((await first).name).toBe('AbortError')
    expect((await store.ensureDetail(7)).content).toBe('new')
  })
  it('allows retry after a failed detail request', async () => {
    http.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ emailId: 2, content: 'recovered' })
    const store = useEmailStore()
    await expect(store.ensureDetail(2)).rejects.toThrow('offline')
    expect((await store.ensureDetail(2, { force: true })).content).toBe('recovered')
  })
  it('preserves a local star mutation when a previously started detail arrives', async () => {
    const pending = deferred(), store = useEmailStore()
    http.get.mockReturnValueOnce(pending.promise)
    const request = store.ensureDetail(2)
    store.updateEmail(2, { isStar: 1 })
    pending.resolve({ emailId: 2, content: 'body', isStar: 0 })
    expect((await request).isStar).toBe(1)
  })
})
