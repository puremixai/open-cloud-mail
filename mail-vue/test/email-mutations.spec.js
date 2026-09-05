import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useEmailStore } from '@/store/email.js'
import { starAdd, starCancel } from '@/request/star.js'
import http from '@/axios/index.js'
vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() } }))
vi.mock('@/router', () => ({ default: { push: vi.fn(), back: vi.fn() } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ back: vi.fn() }), useRoute: () => ({ name: 'email' }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('@vueuse/core', () => ({ useScroll: () => ({ arrivedState: { bottom: false } }) }))
let wrappers, EmailScroll, Content
const row = () => ({ emailId: 1, unread: 0, isStar: 0, text: 'brief' })
const page = () => ({ list: [row()], latestEmail: { emailId: 1 }, total: 1 })
const options = props => ({ props, global: { mocks: { $t: key => key }, directives: { perm: () => {} }, stubs: {
  Icon: true, ShadowHtml: true, skeletonBlock: true, UseVirtualList: { template: '<div/>', methods: { scrollTo() {} } },
  'el-tooltip': true, 'el-dropdown': { template: '<div/>', methods: { handleClose() {} } }, 'el-dropdown-menu': true,
  'el-dropdown-item': true, 'el-checkbox': true, 'el-scrollbar': { template: '<div><slot/></div>' },
  'el-backtop': true, 'el-alert': true, 'el-image-viewer': true,
} } })
beforeEach(async () => {
  localStorage.clear(); setActivePinia(createPinia()); vi.clearAllMocks(); wrappers = []
  DOMRect.fromRect ||= data => data
  EmailScroll = (await import('@/components/email-scroll/index.vue')).default
  Content = (await import('@/views/content/index.vue')).default
})
afterEach(() => wrappers.forEach(wrapper => wrapper.unmount()))

it.each(['email', 'send', 'star'])('%s view registration lets store updates reach the mounted list', async view => {
  http.get.mockResolvedValue(page())
  const View = (await import(`../src/views/${view}/index.vue`)).default
  const wrapper = mount(View, options({})); wrappers.push(wrapper)
  await flushPromises()
  const list = wrapper.findComponent(EmailScroll)
  expect(list.vm.emailList[0].unread).toBe(0)
  useEmailStore().markListRead(1)
  expect(list.vm.emailList[0].unread).toBe(1)
  useEmailStore().updateEmail(1, { isStar: 1 })
  expect(list.vm.emailList[0].isStar).toBe(1)
})

it.each(['success', 'failure'])('a late list star %s cannot override newer detail mutations', async outcome => {
  const store = useEmailStore()
  http.get.mockResolvedValue({ ...row(), text: 'full', attList: [] })
  await store.ensureDetail(1)
  let finishOld, failOld
  http.post.mockReturnValueOnce(new Promise((resolve, reject) => { finishOld = resolve; failOld = reject })).mockResolvedValue(undefined)
  http.delete.mockResolvedValue(undefined)
  const starSuccess = vi.fn()
  const list = mount(EmailScroll, options({ getEmailList: async () => page(), starAdd, starCancel, starSuccess }))
  wrappers.push(list); await flushPromises()
  store.emailScroll = list.vm
  list.vm.$.setupState.starChange(list.vm.emailList[0])
  store.contentData.email = { ...list.vm.emailList[0] }
  const detail = mount(Content, options({})); wrappers.push(detail); await flushPromises()
  expect(store.contentData.email.isStar).toBe(1)
  await detail.vm.$.setupState.changeStar(); await flushPromises()
  expect(store.contentData.email.isStar).toBe(0)
  if (outcome === 'failure') {
    await detail.vm.$.setupState.changeStar(); await flushPromises()
    failOld(new Error('old add failed'))
  } else finishOld()
  await flushPromises()
  const expected = outcome === 'failure' ? 1 : 0
  expect(store.contentData.email.isStar).toBe(expected)
  expect(list.vm.emailList[0].isStar).toBe(expected)
  expect((await store.ensureDetail(1)).isStar).toBe(expected)
  expect(starSuccess).not.toHaveBeenCalled()
})

it.each(['success', 'failure'])('a late detail star %s cannot override newer list mutations', async outcome => {
  const store = useEmailStore()
  http.get.mockResolvedValue({ ...row(), text: 'full', attList: [] })
  let finishOld, failOld
  http.post.mockReturnValueOnce(new Promise((resolve, reject) => { finishOld = resolve; failOld = reject })).mockResolvedValue(undefined)
  http.delete.mockResolvedValue(undefined)
  const list = mount(EmailScroll, options({ getEmailList: async () => page(), starAdd, starCancel }))
  wrappers.push(list); await flushPromises()
  store.emailScroll = list.vm
  store.contentData.email = row()
  const detail = mount(Content, options({})); wrappers.push(detail); await flushPromises()
  detail.vm.$.setupState.changeStar()
  expect(list.vm.emailList[0].isStar).toBe(1)
  await list.vm.$.setupState.starChange(list.vm.emailList[0]); await flushPromises()
  expect(store.contentData.email.isStar).toBe(0)
  if (outcome === 'failure') {
    await list.vm.$.setupState.starChange(list.vm.emailList[0]); await flushPromises()
    failOld(new Error('old detail add failed'))
  } else finishOld()
  await flushPromises()
  const expected = outcome === 'failure' ? 1 : 0
  expect(store.contentData.email.isStar).toBe(expected)
  expect(list.vm.emailList[0].isStar).toBe(expected)
  expect((await store.ensureDetail(1)).isStar).toBe(expected)
})
