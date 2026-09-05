import { expect, it } from 'vitest'
import { createSendAttempt } from '@/utils/send-attempt.js'

it('reuses the requestId for unchanged failed sends, rotating for edits and new compose', () => {
  const attempt = createSendAttempt()
  const form = { subject: 'Hello', content: '<p>body</p>', receiveEmail: ['to@example.com'], attachments: [] }
  const first = attempt.prepare(form)
  expect(first.requestId).toEqual(expect.any(String))
  expect(first.requestId.length).toBeGreaterThan(15)
  expect(attempt.prepare({ ...form }).requestId).toBe(first.requestId)
  const edited = attempt.prepare({ ...form, content: '<p>edit</p>' })
  expect(edited.requestId).not.toBe(first.requestId)
  attempt.reset()
  expect(attempt.prepare(form).requestId).not.toBe(first.requestId)
  expect(form.requestId).toBeUndefined()
})

it('restores an uncertain send after reload without creating a duplicate attempt', () => {
  const first = createSendAttempt().prepare({ subject: 'Hello', attachments: [] })
  const restored = createSendAttempt()
  restored.restore(first)
  expect(restored.prepare(first).requestId).toBe(first.requestId)
  expect(restored.prepare({ ...first, subject: 'Edited' }).requestId).not.toBe(first.requestId)
})

it('keeps draft metadata out of the submitted payload and unchanged retry identity', () => {
  const attempt = createSendAttempt()
  const first = attempt.prepare({ accountId: 1, subject: 'Mail', content: 'body', attachments: [], draftId: null })
  const restored = createSendAttempt()
  const draft = { ...first, draftId: 42, createTime: '2026-09-06', checked: true, formatCreateTime: 'today' }
  restored.restore(draft)
  expect(restored.prepare(draft)).toEqual(first)
  expect(first).not.toHaveProperty('draftId')
})
