import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import IconButton from '@/components/icon-button/index.vue'
import { useSettingStore } from '@/store/setting.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, meta: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/router', () => ({ default: { push: vi.fn(), addRoute: vi.fn(), replace: vi.fn() } }))
vi.mock('@/utils/session.js', () => ({ logoutSession: vi.fn(), endSession: vi.fn() }))
vi.mock('@/perm/perm.js', () => ({ hasPerm: () => true, permsToRouter: () => [] }))
vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('@/request/login.js', () => ({ login: vi.fn(), register: vi.fn() }))
vi.mock('@/request/setting.js', () => ({ websiteConfig: vi.fn() }))
vi.mock('@/request/my.js', () => ({ loginUserInfo: vi.fn() }))
vi.mock('@/request/ouath.js', () => ({ oauthBindUser: vi.fn(), oauthGithubLogin: vi.fn(), oauthGoogleLogin: vi.fn(), oauthLinuxDoLogin: vi.fn(), oauthXaiBindUser: vi.fn(), oauthXaiComplete: vi.fn() }))
let wrapper
beforeEach(() => {
  setActivePinia(createPinia())
  useSettingStore().domainList = ['@example.com']
  useSettingStore().settings = { register: 0, loginOpacity: 1, minEmailPrefix: 1 }
  useUserStore().user = { name: 'Example', email: 'test@example.com', account: {}, role: {} }
  vi.stubGlobal('ElMessageBox', { alert: vi.fn().mockResolvedValue(), confirm: vi.fn() })
  vi.stubGlobal('ElMessage', vi.fn())
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
const global = { mocks: { $t: key => key }, plugins: [ElementPlus], directives: { perm: () => {} } }

it('names icon actions and prevents duplicate activation while busy or disabled', async () => {
  wrapper = mount(IconButton, { props: { action: 'refresh', label: 'Refresh messages' } })
  const button = wrapper.get('button')
  expect(button.attributes('type')).toBe('button')
  expect(button.attributes('aria-label')).toBe('Refresh messages')
  expect(button.attributes('title')).toBe('Refresh messages')
  await button.trigger('click')
  expect(wrapper.emitted('click')).toHaveLength(1)
  await wrapper.setProps({ loading: true })
  expect(button.attributes('aria-busy')).toBe('true')
  expect(button.element.disabled).toBe(true)
  await button.trigger('click')
  await wrapper.setProps({ loading: false, disabled: true })
  await button.trigger('click')
  expect(wrapper.emitted('click')).toHaveLength(1)
})

it('offers login immediately, labels autofill fields, and focuses the invalid field', async () => {
  const Login = (await import('@/views/login/index.vue')).default
  wrapper = mount(Login, { attachTo: document.body, global })
  await flushPromises()
  const email = wrapper.get('input#login-email')
  expect(email.isVisible()).toBe(true)
  expect(email.attributes('autocomplete')).toBe('username')
  expect(wrapper.get('label[for="login-email"]').text()).toBe('emailAccount')
  expect(wrapper.get('input#login-password').attributes('autocomplete')).toBe('current-password')
  await email.trigger('keyup.enter')
  await flushPromises()
  expect(document.activeElement).toBe(email.element)
  expect(email.attributes('aria-invalid')).toBe('true')
  expect(wrapper.get('#login-email-error').text()).toBe('emptyEmailMsg')
  await wrapper.get('button.switch').trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('#register-email').element)
  expect(wrapper.get('#register-password').attributes('autocomplete')).toBe('new-password')
})

it('opens Win95 menus by keyboard, moves between items, and returns focus on Escape', async () => {
  useUiStore().win95 = true
  const Frame = (await import('@/layout/win95/frame.vue')).default
  wrapper = mount(Frame, { attachTo: document.body, global })
  const trigger = wrapper.get('[data-menu-index="0"]')
  trigger.element.focus()
  await trigger.trigger('keydown', { key: 'ArrowDown' })
  await flushPromises()
  const items = wrapper.findAll('.w95-menu-group')[0].findAll('[role="menu"] button')
  expect(document.activeElement).toBe(items[0].element)
  await items[0].trigger('keydown', { key: 'ArrowDown' })
  expect(document.activeElement).toBe(items[1].element)
  await items[1].trigger('keydown', { key: 'Escape' })
  expect(document.activeElement).toBe(trigger.element)
  expect(trigger.attributes('aria-expanded')).toBe('false')
})

it('describes unsupported recycle recovery without inventing an empty result', async () => {
  useUiStore().win95 = true
  const Frame = (await import('@/layout/win95/frame.vue')).default
  wrapper = mount(Frame, { global })
  const bin = wrapper.findAll('button.w95-dicon').find(button => button.text() === 'win95RecycleBin')
  await bin.trigger('click')
  expect(ElMessageBox.alert).toHaveBeenCalledWith('ux.recycleUnsupported', 'win95RecycleBin', expect.any(Object))
  expect(wrapper.text()).not.toContain('win95Homepage')
})

it('switches theme immediately when reduced motion is requested', async () => {
  const Header = (await import('@/layout/header/index.vue')).default
  useUiStore().win95 = false
  useUiStore().dark = false
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const transition = vi.fn()
  document.startViewTransition = transition
  wrapper = mount(Header, { global })
  await wrapper.get('button[aria-label="ux.darkTheme"]').trigger('click')
  expect(useUiStore().dark).toBe(true)
  expect(transition).not.toHaveBeenCalled()
  delete document.startViewTransition
  document.documentElement.className = ''
})
