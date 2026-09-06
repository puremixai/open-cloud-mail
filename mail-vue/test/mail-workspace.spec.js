import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive, nextTick } from 'vue'
import { useUiStore } from '@/store/ui.js'
import { useEmailStore } from '@/store/email.js'
const state = vi.hoisted(() => ({ route: null, push: vi.fn(), replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => state.route, useRouter: () => ({ push: state.push, replace: state.replace }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('@/views/content/index.vue', () => ({ default: { props: ['embedded'], emits: ['close'], template: '<button @click="$emit(\'close\')">close reader</button>' } }))
vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn() } }))
let wrapper, resize
beforeEach(() => {
  setActivePinia(createPinia()); vi.clearAllMocks()
  state.route = reactive({ name: 'email', path: '/inbox', query: {} })
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { resize = width => callback([{ contentRect: { width } }]) } observe() {} disconnect() {} })
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
async function mountWorkspace(width = 1100) {
  const Component = (await import('@/components/mail-workspace/index.vue')).default
  wrapper = mount(Component, { slots: { default: '<div>message list</div>' }, global: { stubs: { Icon: true } } })
  resize(width); await nextTick()
}
it('resizes with the keyboard while reserving readable space for the message', async () => {
  await mountWorkspace()
  const separator = wrapper.get('[role="separator"]')
  await separator.trigger('keydown', { key: 'End' })
  expect(useUiStore().mailListWidth).toBe(560)
  resize(870); await nextTick()
  expect(separator.attributes('aria-valuenow')).toBe('444')
})
it('moves a selected message into the full reader when its container narrows', async () => {
  await mountWorkspace()
  useEmailStore().contentData = { email: { emailId: 42 }, source: 'email' }
  await nextTick(); resize(700); await nextTick()
  expect(state.push).toHaveBeenCalledWith({ path: '/mail', query: { message: 42, source: 'email' } })
  expect(useUiStore().splitReader).toBe(false)
})
it('opens a message URL directly in the full reader on a narrow screen', async () => {
  state.route.query.message = '42'
  useEmailStore().contentData = { email: { emailId: 42 }, source: 'email' }
  await mountWorkspace(390)
  expect(state.push).toHaveBeenCalledWith({ path: '/mail', query: { message: 42, source: 'email' } })
  expect(wrapper.find('[role="separator"]').exists()).toBe(false)
})
it('clears the selected message and URL when closing the embedded reader', async () => {
  await mountWorkspace()
  useEmailStore().contentData = { email: { emailId: 42 }, source: 'email' }
  state.route.query = { message: '42', q: 'design' }; await nextTick()
  await wrapper.get('button').trigger('click')
  expect(useEmailStore().contentData.email).toBeNull()
  expect(state.replace).toHaveBeenCalledWith({ query: { q: 'design' } })
})
it('does not navigate back to mail when the user opens settings', async () => {
  await mountWorkspace()
  useEmailStore().contentData = { email: { emailId: 42 }, source: 'email' }; await nextTick()
  state.route.name = 'setting'; await nextTick()
  expect(state.push).not.toHaveBeenCalled()
  expect(wrapper.find('[role="separator"]').exists()).toBe(false)
})
