import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { KeepAlive, defineComponent, h, nextTick, ref } from 'vue'
import { useUiStore } from '@/store/ui.js'
import { useEmailStore } from '@/store/email.js'
import { useAccountStore } from '@/store/account.js'
import http from '@/axios/index.js'

vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn() } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('@vueuse/core', () => ({ useScroll: () => ({ arrivedState: { bottom: false } }) }))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const page = id => ({ list: [{ emailId: id, createTime: '2026-09-05', subject: 'mail', text: 'brief' }], latestEmail: { emailId: id }, total: 1 })
let wrapper, EmailScroll
beforeEach(async () => { setActivePinia(createPinia()); vi.useFakeTimers(); vi.clearAllMocks(); DOMRect.fromRect ||= data => data; EmailScroll = (await import('@/components/email-scroll/index.vue')).default })
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })
const options = props => ({ props, global: { mocks: { $t: key => key }, directives: { perm: () => {} }, stubs: { Icon: true, skeletonBlock: true, UseVirtualList: { template: '<div/>', methods: { scrollTo() {} } }, 'el-tooltip': true, 'el-dropdown': { methods: { handleOpen() {}, handleClose() {} }, template: '<div><slot name="dropdown"/></div>' }, 'el-dropdown-menu': { template: '<div><slot/></div>' }, 'el-dropdown-item': { template: '<button><slot/></button>' }, 'el-checkbox': true } } })

it('a refresh supersedes the in-flight request and never displays its stale page', async () => {
  const old = deferred(), fresh = deferred()
  const request = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
  wrapper = mount(EmailScroll, options({ getEmailList: request }))
  wrapper.vm.refreshList()
  expect(request).toHaveBeenCalledTimes(2)
  fresh.resolve(page(2)); await flushPromises(); await vi.advanceTimersByTimeAsync(350)
  old.resolve(page(1)); await flushPromises(); await vi.advanceTimersByTimeAsync(350)
  expect(wrapper.vm.emailList.map(e => e.emailId)).toEqual([2])
  expect(request.mock.calls[0][2].signal.aborted).toBe(true)
})

it('context-menu forward waits for full detail and offers retry on failure', async () => {
  const pending = deferred()
  http.get.mockReturnValueOnce(pending.promise)
  const writer = { openForward: vi.fn() }
  useUiStore().writerRef = writer
  wrapper = mount(EmailScroll, options({ getEmailList: () => Promise.resolve(page(1)) }))
  await flushPromises(); await vi.advanceTimersByTimeAsync(350)
  // Set the context item through the same handler used by the rendered row.
  wrapper.vm.$.setupState.handleContextmenu({ clientX: 1, clientY: 1, preventDefault() {} }, wrapper.vm.emailList[0])
  const forward = wrapper.findAll('button').find(b => b.text().includes('forward'))
  await forward.trigger('click')
  expect(writer.openForward).not.toHaveBeenCalled()
  pending.resolve({ emailId: 1, content: '<p>complete body</p>', attList: [] })
  await flushPromises()
  expect(writer.openForward).toHaveBeenCalledWith(expect.objectContaining({ content: '<p>complete body</p>' }))
})

it('removes timers and global listeners while kept alive but inactive', async () => {
  const visible = ref(true)
  const host = defineComponent({ setup: () => () => h(KeepAlive, () => visible.value ? h(EmailScroll, { getEmailList: () => Promise.resolve(page(1)) }) : null) })
  const removeWindow = vi.spyOn(window, 'removeEventListener')
  wrapper = mount(host, options({}))
  await flushPromises(); await vi.advanceTimersByTimeAsync(350)
  visible.value = false; await nextTick()
  expect(vi.getTimerCount()).toBe(0)
  expect(removeWindow.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['wheel', 'resize']))
  removeWindow.mockRestore()
})

it('old-account star completion cannot update another account list', async () => {
  const pending = deferred(), starSuccess = vi.fn()
  wrapper = mount(EmailScroll, options({ getEmailList: () => Promise.resolve(page(1)), starAdd: () => pending.promise, starSuccess }))
  await flushPromises()
  wrapper.vm.$.setupState.starChange(wrapper.vm.emailList[0])
  useAccountStore().currentAccountId = 4
  pending.resolve(); await flushPromises()
  expect(starSuccess).not.toHaveBeenCalled()
  expect(wrapper.vm.emailList).toHaveLength(0)
  expect(useEmailStore().contentData.email).toBeNull()
})

it('retains initial total when a subsequent page skips count', async () => {
  const initial = page(100)
  initial.list = Array.from({ length: 50 }, (_, index) => ({ emailId: 100 - index }))
  initial.total = 123
  const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({ ...page(50), total: null })
  wrapper = mount(EmailScroll, options({ getEmailList: request }))
  await flushPromises()
  wrapper.vm.$.setupState.loadData(); await flushPromises()
  expect(wrapper.vm.total).toBe(123)
  expect(request.mock.calls[1][0]).toBe(51)
})

it('offers an explicit retry when context-menu forward detail fails', async () => {
  http.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ emailId: 1, content: 'retried full body', attList: [] })
  const writer = { openForward: vi.fn() }
  useUiStore().writerRef = writer
  wrapper = mount(EmailScroll, options({ getEmailList: () => Promise.resolve(page(1)) }))
  await flushPromises()
  wrapper.vm.$.setupState.openForward(wrapper.vm.emailList[0]); await flushPromises()
  expect(writer.openForward).not.toHaveBeenCalled()
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(writer.openForward).toHaveBeenCalledWith(expect.objectContaining({ content: 'retried full body' }))
})

it('refreshes an active authenticated list on account switch without recursive resets', async () => {
  localStorage.setItem('token', 'session')
  useEmailStore().syncSession()
  const request = vi.fn().mockResolvedValue(page(1))
  wrapper = mount(EmailScroll, options({ getEmailList: request }))
  await flushPromises()
  useAccountStore().currentAccountId = 9
  await flushPromises()
  expect(wrapper.vm.emailList.map(e => e.emailId)).toEqual([1])
  expect(request.mock.calls.length).toBeLessThan(4)
  localStorage.removeItem('token')
})
