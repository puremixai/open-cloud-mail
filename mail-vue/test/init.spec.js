import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { init } from '@/init/init.js'
import { loginUserInfo } from '@/request/my.js'
import { websiteConfig } from '@/request/setting.js'
import { useUserStore } from '@/store/user.js'
vi.mock('@/request/my.js', () => ({ loginUserInfo: vi.fn() }))
vi.mock('@/request/setting.js', () => ({ websiteConfig: vi.fn() }))
vi.mock('@/router', () => ({ default: { addRoute: vi.fn(), replace: vi.fn() } }))
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.clearAllMocks() })

it('propagates authenticated bootstrap network failure for the retry shell', async () => {
  localStorage.setItem('token', 'session')
  websiteConfig.mockResolvedValue({ domainList: [], title: 'Mail' })
  loginUserInfo.mockRejectedValue(new Error('offline'))
  await expect(init()).rejects.toThrow('offline')
  expect(useUserStore().user).toEqual({})
  loginUserInfo.mockResolvedValue({ email: 'user@example.com', account: { accountId: 1 }, permKeys: [] })
  await init()
  expect(useUserStore().user.email).toBe('user@example.com')
})

it('cannot hydrate a new identity with a previous token bootstrap result', async () => {
  localStorage.setItem('token', 'old')
  let resolve
  websiteConfig.mockResolvedValue({ domainList: [] })
  loginUserInfo.mockReturnValue(new Promise(r => resolve = r))
  const pending = init()
  localStorage.setItem('token', 'new')
  resolve({ email: 'old@example.com', account: { accountId: 1 }, permKeys: [] })
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  expect(useUserStore().user).toEqual({})
})
