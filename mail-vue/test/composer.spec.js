import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAccountStore } from '@/store/account.js'
import { useEmailStore } from '@/store/email.js'
import http from '@/axios/index.js'
import { useUserStore } from '@/store/user.js'
import db from '@/db/db.js'
vi.mock('@/axios/index.js', () => ({ default: { post: vi.fn(), get: vi.fn() } }))
vi.mock('@/router', () => ({ default: { replace: vi.fn() } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('@/db/db.js', () => ({ default: { value: {
  recovery: { get: vi.fn(async () => null), put: vi.fn(async () => {}), delete: vi.fn(async () => {}), toArray: vi.fn(async () => []) },
  draft: { get: vi.fn(async () => null), add: vi.fn(async () => 1), put: vi.fn(async () => 1), delete: vi.fn(async () => {}) },
  att: { get: vi.fn(async () => null), put: vi.fn(async () => {}), delete: vi.fn(async () => {}) },
  transaction: async (_, ...args) => args.at(-1)(),
} } }))
vi.mock('@/components/tiny-editor/index.vue', () => ({ default: { template: '<div/>', methods: { clearEditor() {}, getContent() { return '<p>body</p>' }, focus() {} } } }))
let wrapper, Composer
beforeEach(async () => {
  localStorage.clear(); setActivePinia(createPinia()); vi.clearAllMocks()
  vi.stubGlobal('ElMessage', vi.fn(() => ({ close() {} })))
  vi.stubGlobal('ElNotification', vi.fn())
  useAccountStore().currentAccount = { accountId: 1, email: 'from@example.com' }
  useUserStore().user = { email: 'owner@example.com', account: { accountId: 1 } }
  Composer = (await import('@/layout/write/index.vue')).default
  wrapper = shallowMount(Composer, { global: { mocks: { $t: key => key }, stubs: { tinyEditor: false, 'el-input-tag': true, 'el-select': true, 'el-option': true, 'el-input': true, 'el-button': true, 'el-dialog': true, 'el-table': true, 'el-table-column': true } } })
})
afterEach(() => { wrapper.unmount(); vi.unstubAllGlobals(); vi.useRealTimers() })

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

it('closing an edited mail offers explicit choices and continuing keeps all content', async () => {
  const setup = wrapper.vm.$.setupState
  setup.show = true
  Object.assign(setup.form, { subject: 'Keep me', content: 'body', attachments: [{ filename: 'notes.txt', content: 'abc' }] })
  await setup.close()
  expect(setup.closePrompt).toBe(true)
  setup.continueEditing()
  expect(setup.show).toBe(true)
  expect(setup.closePrompt).toBe(false)
  expect(setup.form.subject).toBe('Keep me')
  expect(setup.form.attachments).toHaveLength(1)
})

it('Escape does nothing when the composer is hidden', async () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(wrapper.vm.$.setupState.closePrompt).toBe(false)
})

it('a failed explicit draft save retains the editor and exposes retry feedback', async () => {
  const setup = wrapper.vm.$.setupState
  setup.show = true
  setup.form.subject = 'Keep me'
  db.value.draft.add.mockRejectedValueOnce(new Error('quota'))
  await setup.saveAndClose()
  expect(setup.show).toBe(true)
  expect(setup.form.subject).toBe('Keep me')
  expect(setup.saveState).toBe('error')
})

it('autosaves the latest body and attachments and warns before unsaved work is unloaded', async () => {
  vi.useFakeTimers()
  useUserStore().user = { email: 'owner@example.com' }
  const setup = wrapper.vm.$.setupState
  setup.show = true
  Object.assign(setup.form, { accountId: 1, subject: 'Recovery', content: 'Latest body', attachments: [{ filename: 'a.txt', content: 'YWJj' }] })
  await flushPromises()
  const beforeSave = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(beforeSave)
  expect(beforeSave.defaultPrevented).toBe(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(db.value.recovery.put).toHaveBeenCalledWith(expect.objectContaining({
    accountId: 1, form: expect.objectContaining({ content: 'Latest body', attachments: [{ filename: 'a.txt', content: 'YWJj' }] }),
  }))
  expect(setup.saveState).toBe('saved')
  const afterSave = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(afterSave)
  expect(afterSave.defaultPrevented).toBe(false)
})

it('does not send when the attempt recovery cannot be persisted', async () => {
  const setup = wrapper.vm.$.setupState
  setup.show = true
  Object.assign(setup.form, { receiveEmail: ['to@example.com'], subject: 'Keep', content: 'body' })
  db.value.recovery.put.mockRejectedValueOnce(new Error('storage quota'))
  await setup.sendEmail(); await flushPromises()
  expect(http.post).not.toHaveBeenCalled()
  expect(setup.show).toBe(true)
  expect(setup.sending).toBe(false)
  expect(setup.saveState).toBe('error')
})

it('removes the previous recovery when the user manually empties the composer', async () => {
  vi.useFakeTimers()
  const setup = wrapper.vm.$.setupState
  setup.show = true
  setup.form.subject = 'Remove this recovery'
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1000)
  const id = db.value.recovery.put.mock.calls.at(-1)[0].id
  setup.form.subject = ''
  const pending = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(pending)
  expect(pending.defaultPrevented).toBe(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(db.value.recovery.delete).toHaveBeenCalledWith(id)
  expect(setup.saveState).toBe('saved')
})

it('a saved uncertain draft retries exactly the original outgoing payload', async () => {
  const setup = wrapper.vm.$.setupState
  setup.show = true
  Object.assign(setup.form, { receiveEmail: ['to@example.com'], subject: 'Uncertain', content: 'body' })
  http.post.mockRejectedValue(new Error('timeout'))
  await setup.sendEmail(); await flushPromises()
  const first = http.post.mock.calls[0][1]
  await setup.saveAndClose(); await flushPromises()
  const draft = { ...db.value.draft.add.mock.calls.at(-1)[0], draftId: 1, attachments: [] }
  setup.openDraft(draft)
  await setup.sendEmail(); await flushPromises()
  expect(http.post.mock.calls[1][1]).toEqual(first)
})

it('blocks sending and saving while selected attachments are being read', async () => {
  const setup = wrapper.vm.$.setupState
  setup.show = true
  Object.assign(setup.form, { receiveEmail: ['to@example.com'], subject: 'Files', content: 'body' })
  setup.attachmentReads = 1
  await setup.sendEmail()
  await setup.saveAndClose()
  expect(http.post).not.toHaveBeenCalled()
  expect(db.value.draft.add).not.toHaveBeenCalled()
})

it('cleans up an accepted old submission without reopening the new mailbox composer', async () => {
  const setup = wrapper.vm.$.setupState
  setup.show = true
  Object.assign(setup.form, { receiveEmail: ['to@example.com'], subject: 'Accepted', content: 'body' })
  let resolve
  http.post.mockReturnValueOnce(new Promise(r => { resolve = r }))
  await setup.sendEmail()
  const snapshot = db.value.recovery.put.mock.calls.at(-1)[0]
  db.value.recovery.get.mockResolvedValueOnce(snapshot)
  useAccountStore().currentAccountId = 22
  resolve([{ emailId: 999, subject: 'Accepted' }])
  await flushPromises()
  expect(db.value.recovery.delete).toHaveBeenCalledWith(snapshot.id)
  expect(setup.show).toBe(false)
  expect(setup.form.subject).toBe('')
})
