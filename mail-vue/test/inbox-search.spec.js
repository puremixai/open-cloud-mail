import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAccountStore } from '@/store/account.js'
import { useSettingStore } from '@/store/setting.js'
import { useEmailStore } from '@/store/email.js'
const polling = vi.hoisted(() => ({ run: null }))
vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn() } }))
vi.mock('@/utils/mail-polling.js', () => ({ useMailPolling: run => { polling.run = run } }))
vi.mock('@/request/email.js', () => ({ emailList: vi.fn().mockResolvedValue({ list: [] }), emailDelete: vi.fn(), emailRead: vi.fn(), emailLatest: vi.fn().mockResolvedValue([]) }))
vi.mock('@/request/star.js', () => ({ starAdd: vi.fn(), starCancel: vi.fn() }))
vi.mock('@/router/index.js', () => ({ default: { push: vi.fn() } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'email' }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
import { emailList, emailLatest } from '@/request/email.js'
let wrapper
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); emailList.mockResolvedValue({ list: [] }); emailLatest.mockResolvedValue([]) })
afterEach(() => wrapper?.unmount())
it('submits trimmed search to the server, clears stale results and pauses unfiltered polling', async () => {
  const Inbox = (await import('@/views/email/index.vue')).default
  const refreshList = vi.fn()
  wrapper = mount(Inbox, { global: { mocks: { $t: key => key }, stubs: { emailScroll: { props: ['getEmailList'], methods: { refreshList }, template: '<div><slot name="filters"/><slot name="first"/></div>' } } } })
  await wrapper.get('input[type="search"]').setValue('  invoice  ')
  await wrapper.get('form').trigger('submit')
  expect(refreshList).toHaveBeenCalledWith(true)
  const list = wrapper.findComponent({ ref: 'scroll' })
  await list.props('getEmailList')(0, 50, {})
  expect(emailList.mock.calls[0][7].search).toBe('invoice')
  useSettingStore().settings.autoRefresh = 10
  useEmailStore().emailScroll.firstLoad = false
  useEmailStore().emailScroll.latestEmail = { emailId: 1, reqAccountId: useAccountStore().currentAccountId }
  await polling.run(undefined, () => true)
  expect(emailLatest).not.toHaveBeenCalled()
  await wrapper.get('button[data-test="clear-search"]').trigger('click'); await flushPromises()
  await list.props('getEmailList')(0, 50, {})
  expect(emailList.mock.calls.at(-1)[7].search).toBe('')
})
