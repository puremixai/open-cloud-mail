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

const renderedOptions = props => {
  const result = options(props)
  result.global.stubs.UseVirtualList = { props: ['list', 'options'], template: '<div><template v-for="(item, index) in list"><slot :data="item" :index="index" /></template></div>', methods: { scrollTo() {} } }
  return result
}

it('reports the actual selected count, caps loaded selection at 95 and resets after clearing', async () => {
  wrapper = mount(EmailScroll, renderedOptions({ getEmailList: async () => ({ list: Array.from({ length: 100 }, (_, index) => ({ emailId: index + 1 })), total: 100 }) }))
  await flushPromises()
  wrapper.vm.handleCheckAllChange(true); await nextTick()
  expect(wrapper.get('[data-test="selection-status"]').attributes('data-count')).toBe('95')
  expect(wrapper.text()).toContain('ux.selectionLimit')
  wrapper.vm.emailList[0].checked = false; await nextTick()
  expect(wrapper.get('[data-test="selection-status"]').attributes('data-count')).toBe('94')
  wrapper.vm.emailList.splice(0); await nextTick()
  expect(wrapper.find('[data-test="selection-status"]').exists()).toBe(false)
  expect(wrapper.vm.$.setupState.isSelectMax).toBe(false)
})

it('uses a native open-mail button separate from checkbox and star controls', async () => {
  wrapper = mount(EmailScroll, renderedOptions({ getEmailList: async () => page(1) }))
  await flushPromises()
  const row = wrapper.get('.email-row')
  expect(row.attributes('tabindex')).toBeUndefined()
  expect(row.attributes('aria-label')).toBeTruthy()
  const open = row.get('button.mail-open')
  expect(open.attributes('type')).toBe('button')
  expect(open.attributes('aria-label')).toBeTruthy()
  expect(open.find('button, input').exists()).toBe(false)
  await open.trigger('click')
  expect(wrapper.emitted('jump')).toHaveLength(1)
  await row.get('el-checkbox-stub').trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('jump')).toHaveLength(1)
  await open.trigger('keydown', { key: 'F10', shiftKey: true })
  expect(wrapper.vm.$.setupState.rightClickEmail.emailId).toBe(1)
})

it('uses the observed container width for virtual height and exposes density in Win95', async () => {
  let resize
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { resize = callback } observe() {} disconnect() { disconnect() } })
  localStorage.removeItem('email-dense')
  useUiStore().win95 = true
  wrapper = mount(EmailScroll, renderedOptions({ getEmailList: async () => page(1) }))
  await flushPromises()
  resize([{ contentRect: { width: 620 } }]); await nextTick()
  expect(wrapper.classes()).toContain('mail-narrow')
  expect(wrapper.vm.$.setupState.itemHeight).toBe(88)
  expect(wrapper.get('[data-test="density-toggle"]').exists()).toBe(true)
  await wrapper.get('[data-test="density-toggle"]').trigger('click')
  expect(wrapper.vm.$.setupState.itemHeight).toBe(72)
  resize([{ contentRect: { width: 1100 } }]); await nextTick()
  expect(wrapper.vm.$.setupState.itemHeight).toBe(40)
  expect(wrapper.attributes('style')).toContain('--mail-row-height: 40px')
  wrapper.unmount(); wrapper = null
  expect(disconnect).toHaveBeenCalled()
  vi.unstubAllGlobals()
})

it('keeps current mail visible when a refresh fails and offers a retry', async () => {
  const request = vi.fn().mockResolvedValueOnce(page(1)).mockRejectedValueOnce(new Error('offline'))
  wrapper = mount(EmailScroll, renderedOptions({ getEmailList: request }))
  await flushPromises()
  await wrapper.get('button[aria-label="ux.refreshMail"]').trigger('click'); await flushPromises()
  expect(wrapper.vm.emailList.map(item => item.emailId)).toEqual([1])
  expect(wrapper.find('[role="alert"] button').exists()).toBe(true)
})

it('clears a batch operation lock on account change and ignores its later failure', async () => {
  let reject
  wrapper = mount(EmailScroll, renderedOptions({ getEmailList: async () => page(1), emailRead: () => new Promise((_, r) => { reject = r }) }))
  await flushPromises()
  wrapper.vm.handleCheckAllChange(true)
  wrapper.vm.handleRead()
  expect(wrapper.vm.$.setupState.batchAction).toBe('read')
  useAccountStore().currentAccountId = 5
  await nextTick()
  expect(wrapper.vm.$.setupState.batchAction).toBe('')
  reject(new Error('old account failed')); await flushPromises()
  expect(wrapper.vm.$.setupState.batchError).toBe(false)
})

it('shows one star control and locks selection and mutations while retained rows refresh', async () => {
  const pending = deferred(), initial = page(1)
  initial.list[0].isStar = 1
  const request = vi.fn().mockResolvedValueOnce(initial).mockReturnValueOnce(pending.promise)
  wrapper = mount(EmailScroll, renderedOptions({ getEmailList: request, showUnread: true }))
  await flushPromises()
  wrapper.vm.handleCheckAllChange(true); await nextTick()
  const row = wrapper.get('.email-row')
  expect(row.find('.name svg').exists()).toBe(false)
  await wrapper.get('button[aria-label="ux.refreshMail"]').trigger('click')
  expect(row.get('el-checkbox-stub').attributes('disabled')).toBe('true')
  expect(row.get('button[data-action="star"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('button[aria-label="ux.deleteSelected"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-test="selection-status"]').attributes('data-count')).toBe('1')
  pending.resolve(page(2)); await flushPromises()
  expect(wrapper.find('[data-test="selection-status"]').exists()).toBe(false)
  expect(wrapper.vm.emailList[0].emailId).toBe(2)
})

it('drops a pending context reply when a new search clears the list', async () => {
  const pending = deferred()
  http.get.mockReturnValueOnce(pending.promise)
  const writer = { openReply: vi.fn() }
  useUiStore().writerRef = writer
  wrapper = mount(EmailScroll, renderedOptions({ getEmailList: async () => page(1) }))
  await flushPromises()
  wrapper.vm.$.setupState.openReply(wrapper.vm.emailList[0])
  await wrapper.vm.refreshList(true)
  pending.resolve({ emailId: 1, content: 'old search mail' }); await flushPromises()
  expect(writer.openReply).not.toHaveBeenCalled()
})

it('updates the filtered result total once per removed loaded mail and retains it on cursor loads', async () => {
  const initial = { list: Array.from({ length: 50 }, (_, index) => ({ emailId: 100 - index })), total: 123, latestEmail: { emailId: 100 } }
  const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({ ...page(50), total: null })
  wrapper = mount(EmailScroll, options({ getEmailList: request, emptyMessage: 'ux.emptySearch' }))
  await flushPromises()
  // Repeated ids and unknown/unloaded ids must not inflate the decrement.
  wrapper.vm.deleteEmail([100, 100, 99, 900])
  expect(wrapper.vm.total).toBe(121)
  await flushPromises()
  expect(request.mock.calls[1][0]).toBe(51)
  expect(wrapper.vm.total).toBe(121)
  // The same deletion may also arrive from the shared store broadcast.
  useEmailStore().deleteIds = [100, 99]
  await flushPromises()
  expect(wrapper.vm.total).toBe(121)
  wrapper.vm.deleteEmail([900])
  expect(wrapper.vm.total).toBe(121)
})
