import { expect, it, vi } from 'vitest'
import { setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
vi.mock('@/request/setting.js', () => ({ websiteConfig: vi.fn() }))
vi.mock('@/request/my.js', () => ({ loginUserInfo: vi.fn() }))

it('imports real main before Pinia, mounts a failure shell, and renders the router after retry', async () => {
  setActivePinia(undefined)
  localStorage.clear()
  localStorage.setItem('token', 'session')
  document.body.innerHTML = '<div id="app"></div>'
  const { websiteConfig } = await import('@/request/setting.js')
  const { loginUserInfo } = await import('@/request/my.js')
  websiteConfig.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ domainList: [], title: 'Mail' })
  loginUserInfo.mockResolvedValue({ email: 'user@example.com', account: { accountId: 1 }, permKeys: [] })
  const router = (await import('@/router')).default
  router.addRoute({ path: '/inbox', name: 'email', component: { template: '<p>Inbox ready</p>' } })
  await import('@/main.js')
  await flushPromises()
  expect(document.querySelector('[role="alert"]')).not.toBeNull()
  document.querySelector('[role="alert"] button').click()
  await flushPromises()
  await router.isReady()
  await flushPromises()
  expect(document.body.textContent).toContain('Inbox ready')
  document.querySelector('#app').__vue_app__.unmount()
})
