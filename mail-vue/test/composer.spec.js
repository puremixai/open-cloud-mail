import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAccountStore } from '@/store/account.js'
import { useEmailStore } from '@/store/email.js'
import http from '@/axios/index.js'
vi.mock('@/axios/index.js', () => ({ default: { post: vi.fn(), get: vi.fn() } }))
vi.mock('@/router', () => ({ default: { replace: vi.fn() } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('@/db/db.js', () => ({ default: { value: {} } }))
vi.mock('@/components/tiny-editor/index.vue', () => ({ default: { template: '<div/>', methods: { clearEditor() {}, getContent() { return '<p>body</p>' }, focus() {} } } }))
let wrapper, Composer
beforeEach(async () => {
  localStorage.clear(); setActivePinia(createPinia()); vi.clearAllMocks()
  vi.stubGlobal('ElMessage', vi.fn(() => ({ close() {} })))
  vi.stubGlobal('ElNotification', vi.fn())
  useAccountStore().currentAccount = { accountId: 1, email: 'from@example.com' }
  Composer = (await import('@/layout/write/index.vue')).default
  wrapper = shallowMount(Composer, { global: { mocks: { $t: key => key }, stubs: { tinyEditor: false, 'el-input-tag': true, 'el-select': true, 'el-option': true, 'el-input': true, 'el-button': true, 'el-dialog': true, 'el-table': true, 'el-table-column': true } } })
})
afterEach(() => { wrapper.unmount(); vi.unstubAllGlobals() })

it('actual send payload retains attempt ID on explicit retry and rotates after editing', async () => {
  const setup = wrapper.vm.$.setupState
  Object.assign(setup.form, { receiveEmail: ['to@example.com'], subject: 'Hello', content: '<p>body</p>' })
  http.post.mockRejectedValue(new Error('Network Error'))
  await setup.sendEmail(); await flushPromises()
  expect(http.post).toHaveBeenCalledTimes(1)
  const first = http.post.mock.calls[0][1].requestId
  expect(first).toEqual(expect.any(String))
  await setup.sendEmail(); await flushPromises()
  expect(http.post.mock.calls[1][1].requestId).toBe(first)
  setup.form.content = '<p>edited</p>'
  await setup.sendEmail(); await flushPromises()
  expect(http.post.mock.calls[2][1].requestId).not.toBe(first)
})

it('account switch clears quoted mail and a failed old send cannot reopen the composer', async () => {
  const setup = wrapper.vm.$.setupState
  Object.assign(setup.form, { receiveEmail: ['to@example.com'], subject: 'private', content: '<p>secret</p>' })
  let reject
  http.post.mockReturnValueOnce(new Promise((_, r) => reject = r))
  await setup.sendEmail()
  useAccountStore().currentAccountId = 5
  reject(new Error('offline')); await flushPromises()
  expect(setup.form.content).toBe('')
  expect(setup.form.subject).toBe('')
  expect(setup.show).toBe(false)
  expect(useEmailStore().contentData.email).toBeNull()
})

it.each([
  ['confirmed not sent', { code: 424, message: 'Not sent' }, true],
  ['uncertain or in progress', { code: 409, message: 'In progress' }, false],
  ['network error', new Error('Network Error'), false],
  ['timeout', { code: 'ECONNABORTED', message: 'timeout' }, false],
])('manual retry after %s rotates the attempt only for confirmed 424', async (_, error, rotates) => {
  const setup = wrapper.vm.$.setupState
  Object.assign(setup.form, { receiveEmail: ['to@example.com'], subject: 'Hello', content: '<p>body</p>' })
  http.post.mockRejectedValueOnce(error).mockRejectedValueOnce(new Error('Network Error'))
  await setup.sendEmail(); await flushPromises()
  expect(http.post).toHaveBeenCalledTimes(1)
  const first = http.post.mock.calls[0][1].requestId
  expect(setup.form.content).toBe('<p>body</p>')
  await setup.sendEmail(); await flushPromises()
  expect(http.post).toHaveBeenCalledTimes(2)
  const second = http.post.mock.calls[1][1].requestId
  expect(second).toEqual(expect.any(String))
  if (rotates) expect(second).not.toBe(first)
  else expect(second).toBe(first)
})
