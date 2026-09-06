import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useEmailStore } from '@/store/email.js'
import ConnectionStatus from '@/components/connection-status/index.vue'
const state = vi.hoisted(() => ({ route: { name: 'email' } }))
vi.mock('vue-router', () => ({ useRoute: () => state.route }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn() } }))
let wrapper, online
beforeEach(() => {
  setActivePinia(createPinia()); vi.useFakeTimers(); state.route.name = 'email'
  online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.useRealTimers() })
it('announces disconnection and offers a refresh that retains the loaded messages on reconnection', async () => {
  const refreshList = vi.fn()
  useEmailStore().emailScroll = { refreshList }
  wrapper = mount(ConnectionStatus)
  expect(wrapper.text()).toContain('ux.offlineTitle')
  expect(wrapper.find('button').exists()).toBe(false)
  online.mockReturnValue(true); window.dispatchEvent(new Event('online')); await nextTick()
  expect(wrapper.text()).toContain('ux.onlineAgain')
  await wrapper.get('button').trigger('click')
  expect(refreshList).toHaveBeenCalledWith(false)
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
})
it('dismisses the restored banner and omits a refresh action outside a mail list', async () => {
  state.route.name = 'setting'
  wrapper = mount(ConnectionStatus)
  online.mockReturnValue(true); window.dispatchEvent(new Event('online')); await nextTick()
  expect(wrapper.text()).toContain('ux.onlineAgain')
  expect(wrapper.find('button').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(8000)
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
})
