import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useEmailStore } from '@/store/email.js'
import { useUiStore } from '@/store/ui.js'
import http from '@/axios/index.js'
vi.mock('@/axios/index.js', () => ({ default: { get: vi.fn(), put: vi.fn().mockResolvedValue(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ back: vi.fn() }) }))
let Content, wrapper
beforeEach(async () => { setActivePinia(createPinia()); vi.clearAllMocks(); Content = (await import('@/views/content/index.vue')).default })
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.restoreAllMocks() })
const mountContent = () => mount(Content, { global: { mocks: { $t: key => key }, directives: { perm: () => {} }, stubs: { Icon: true, ShadowHtml: true, 'el-scrollbar': { template: '<div><slot/></div>' }, 'el-backtop': true, 'el-alert': true, 'el-image-viewer': true } } })

it('loads complete detail, offers retry, and uses signed attachment URL while preserving key', async () => {
  const store = useEmailStore()
  store.contentData.email = { emailId: 3, subject: 'brief', text: 'preview' }
  http.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ emailId: 3, subject: 'full', text: 'complete', attList: [{ attId: 1, key: 'private/pic', filename: 'pic.png', size: 10, url: 'https://mail.example.com/api/signed?token=abc' }] })
  wrapper = mountContent(); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  await wrapper.get('[data-test="detail-retry"]').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('complete')
  expect(wrapper.get('a[download]').attributes('href')).toBe('https://mail.example.com/api/signed?token=abc')
  expect(store.contentData.email.attList[0].key).toBe('private/pic')
})
it('a slow detail or star response for A never replaces or stars B', async () => {
  const store = useEmailStore()
  let resolveA, resolveStar
  http.get.mockReturnValueOnce(new Promise(r => resolveA = r)).mockResolvedValueOnce({ emailId: 2, subject: 'B', content: 'body B', isStar: 0 })
  http.post.mockReturnValueOnce(new Promise(r => resolveStar = r))
  store.contentData.email = { emailId: 1, subject: 'A', isStar: 0 }
  wrapper = mountContent()
  wrapper.vm.$.setupState.changeStar()
  store.contentData.email = { emailId: 2, subject: 'B', isStar: 0 }
  await flushPromises()
  resolveStar(); resolveA({ emailId: 1, subject: 'A', content: 'body A', isStar: 0 }); await flushPromises()
  expect(store.contentData.email).toMatchObject({ emailId: 2, content: 'body B', isStar: 0 })
})
it('detail reply awaits full data even when the initial row has preview text', async () => {
  const store = useEmailStore()
  store.contentData.email = { emailId: 8, content: 'unsigned old body' }
  let resolve
  http.get.mockReturnValue(new Promise(r => resolve = r))
  const openReply = vi.fn()
  useUiStore().writerRef = { openReply }
  wrapper = mountContent()
  wrapper.vm.$.setupState.openReply()
  expect(openReply).not.toHaveBeenCalled()
  resolve({ emailId: 8, content: 'full signed body', attList: [] }); await flushPromises()
  expect(openReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'full signed body' }))
})

const attachmentMail = url => ({ emailId: 3, text: 'body', attList: [{ attId: 7, key: 'private/pic', filename: 'pic.png', size: 10, url }] })

it.each(['download', 'preview'])('refreshes an expired attachment capability before %s', async action => {
  vi.useFakeTimers()
  const store = useEmailStore()
  store.contentData.email = { emailId: 3 }
  store.contentData.admin = true
  const fresh = attachmentMail('https://mail.example.com/api/signed?token=fresh')
  fresh.attList.unshift({ attId: 8, key: 'private/other', filename: 'other.png', url: '/wrong-attachment' })
  http.get.mockResolvedValueOnce(attachmentMail('/expired')).mockResolvedValueOnce(fresh)
  const downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push({ url: this.href, filename: this.download }) })
  wrapper = mountContent(); await flushPromises()
  vi.setSystemTime(Date.now() + 16 * 60 * 1000)
  if (action === 'download') await wrapper.get('a[download]').trigger('click')
  else await wrapper.get('.att-name').trigger('click')
  await flushPromises()
  expect(http.get.mock.calls.map(args => args[0])).toEqual(['/allEmail/detail', '/allEmail/detail'])
  if (action === 'download') expect(downloads).toEqual([{ url: 'https://mail.example.com/api/signed?token=fresh', filename: 'pic.png' }])
  else expect(wrapper.vm.$.setupState.srcList).toEqual(['https://mail.example.com/api/signed?token=fresh'])
  expect(store.contentData.email.attList.find(att => att.attId === 7).key).toBe('private/pic')
})

it('never downloads an attachment after the current message changes during refresh', async () => {
  vi.useFakeTimers()
  const store = useEmailStore()
  store.contentData.email = { emailId: 3 }
  let resolve
  http.get.mockResolvedValueOnce(attachmentMail('/expired')).mockReturnValueOnce(new Promise(r => resolve = r))
    .mockResolvedValueOnce({ emailId: 4, text: 'other mail', attList: [] })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  wrapper = mountContent(); await flushPromises()
  vi.setSystemTime(Date.now() + 16 * 60 * 1000)
  await wrapper.get('a[download]').trigger('click'); await flushPromises()
  expect(http.get).toHaveBeenCalledTimes(2)
  store.contentData.email = { emailId: 4 }
  await flushPromises()
  resolve(attachmentMail('/fresh-but-no-longer-selected')); await flushPromises()
  expect(click).not.toHaveBeenCalled()
  expect(store.contentData.email.emailId).toBe(4)
})

it('never previews a refreshed attachment after session reset', async () => {
  vi.useFakeTimers()
  const store = useEmailStore()
  store.contentData.email = { emailId: 3 }
  let resolve
  http.get.mockResolvedValueOnce(attachmentMail('/expired')).mockReturnValueOnce(new Promise(r => resolve = r))
  wrapper = mountContent(); await flushPromises()
  vi.setSystemTime(Date.now() + 16 * 60 * 1000)
  await wrapper.get('.att-name').trigger('click'); await flushPromises()
  expect(http.get).toHaveBeenCalledTimes(2)
  store.resetSession()
  resolve(attachmentMail('/fresh-from-old-session')); await flushPromises()
  expect(wrapper.vm.$.setupState.showPreview).toBe(false)
  expect(wrapper.vm.$.setupState.srcList).toEqual([])
  expect(store.contentData.email).toBeNull()
})

it('retries a failed capability refresh explicitly without downloading the stale URL', async () => {
  vi.useFakeTimers()
  const store = useEmailStore()
  store.contentData.email = { emailId: 3 }
  http.get.mockResolvedValueOnce(attachmentMail('/expired')).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(attachmentMail('/fresh-after-retry'))
  const downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push(this.href) })
  wrapper = mountContent(); await flushPromises()
  vi.setSystemTime(Date.now() + 16 * 60 * 1000)
  await wrapper.get('a[download]').trigger('click'); await flushPromises()
  expect(downloads).toEqual([])
  await wrapper.get('[data-test="detail-retry"]').trigger('click'); await flushPromises()
  expect(downloads).toEqual(['https://mail.example.com/fresh-after-retry'])
})
