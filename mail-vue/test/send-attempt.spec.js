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
