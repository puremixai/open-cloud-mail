import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import http from '@/axios/index.js'
import { useEmailStore } from '@/store/email.js'
import { useUserStore } from '@/store/user.js'
import router from '@/router'
vi.mock('@/router', () => ({ default: { replace: vi.fn().mockResolvedValue() } }))
vi.mock('element-plus', () => ({ ElMessage: vi.fn() }))
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.clearAllMocks() })
const response = (data, status = 200) => async config => ({ data, status, statusText: '', headers: {}, config })

it('sets a finite timeout and preserves raw auth and language headers', async () => {
  localStorage.setItem('token', 'token-value')
  await http.get('/example', { adapter: async config => {
    expect(config.timeout).toBeGreaterThan(0)
    expect(config.headers.Authorization).toBe('token-value')
    expect(config.headers['accept-language']).toBeDefined()
    return response({ code: 200, data: 'ok' })(config)
  } })
})
it('rejects errors with missing config and HTTP 403 rather than swallowing or reloading', async () => {
  await expect(http.get('/fail', { adapter: () => Promise.reject(new Error('missing config')) })).rejects.toThrow('missing config')
  const error = Object.assign(new Error('denied'), { status: 403, response: { status: 403 } })
  await expect(http.get('/fail', { adapter: () => Promise.reject(error) })).rejects.toBe(error)
})
it('clears mail and identity on noMsg 401 too', async () => {
  localStorage.setItem('token', 'old')
  const store = useEmailStore()
  useUserStore().user = { email: 'old@example.com' }
  store.contentData.email = { emailId: 1, content: 'private body' }
  await expect(http.get('/latest', { noMsg: true, adapter: response({ code: 401, message: 'expired' }) })).rejects.toMatchObject({ code: 401 })
  expect(localStorage.getItem('token')).toBeNull()
  expect(store.contentData.email).toBeNull()
  expect(useUserStore().user).toEqual({})
  expect(router.replace).toHaveBeenCalledWith('/login')
})
it('an old session 401 cannot log out a newly signed-in user', async () => {
  localStorage.setItem('token', 'old')
  await expect(http.get('/latest', { noMsg: true, adapter: config => {
    localStorage.setItem('token', 'new')
    return response({ code: 401 })(config)
  } })).rejects.toBeDefined()
  expect(localStorage.getItem('token')).toBe('new')
  expect(router.replace).not.toHaveBeenCalled()
})
