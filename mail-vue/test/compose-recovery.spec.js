import { expect, it } from 'vitest'
import { createComposeRecovery, persistDraft } from '@/utils/compose-recovery.js'

function database() {
  const rows = new Map(), drafts = new Map(), attachments = new Map()
  const table = map => ({
    put: async value => { const key = value.id ?? value.draftId; map.set(key, structuredClone(value)); return key },
    delete: async id => map.delete(id),
    get: async id => map.get(id),
    toArray: async () => [...map.values()],
  })
  const db = { recovery: table(rows), draft: { ...table(drafts), add: async value => { const id = drafts.size + 1; drafts.set(id, { ...value, draftId: id }); return id } }, att: table(attachments) }
  db.transaction = async (_, ...args) => args.at(-1)()
  return { db, rows, drafts, attachments }
}

it('snapshots attachments and isolates recovery lists by mailbox and database', async () => {
  const first = database(), second = database()
  const a = createComposeRecovery(first.db), b = createComposeRecovery(second.db)
  const record = { id: 'one', accountId: 1, updatedAt: 1, form: { subject: 'Private', attachments: [{ content: 'base64-file' }] } }
  const saved = a.save(record)
  record.form.subject = 'Later edit'
  await saved
  await a.save({ id: 'two', accountId: 2, updatedAt: 2, form: { subject: 'Other mailbox' } })
  expect(await a.list(1)).toEqual([expect.objectContaining({ form: { subject: 'Private', attachments: [{ content: 'base64-file' }] } })])
  expect(await b.list(1)).toEqual([])
})

it('serializes delete after an in-flight write so discarded mail cannot reappear', async () => {
  const { db, rows } = database()
  const put = db.recovery.put
  let release
  db.recovery.put = async value => { await new Promise(resolve => { release = resolve }); return put(value) }
  const recovery = createComposeRecovery(db)
  const saving = recovery.save({ id: 'one', accountId: 1 })
  await Promise.resolve()
  const deleting = recovery.remove('one')
  release()
  await Promise.all([saving, deleting])
  expect(rows.size).toBe(0)
})

it('allows retry after storage failure rather than poisoning later saves', async () => {
  const { db } = database(), put = db.recovery.put
  db.recovery.put = async () => { throw new Error('quota exceeded') }
  const recovery = createComposeRecovery(db)
  await expect(recovery.save({ id: 'one' })).rejects.toThrow('quota exceeded')
  db.recovery.put = put
  await recovery.save({ id: 'two', accountId: 1 })
  expect((await recovery.list(1)).map(record => record.id)).toEqual(['two'])
})

it('persists draft and attachments together without mutating the compose form', async () => {
  const { db, drafts, attachments } = database()
  const form = { draftId: null, subject: 'Draft', content: '', requestId: 'uncertain-attempt', attachments: [{ filename: 'notes.txt', content: 'abc' }] }
  const id = await persistDraft(db, form)
  expect(drafts.get(id).subject).toBe('Draft')
  expect(drafts.get(id).requestId).toBe('uncertain-attempt')
  expect(attachments.get(id).attachments).toEqual(form.attachments)
  expect(form.draftId).toBeNull()
  await persistDraft(db, { ...form, draftId: id, subject: 'Updated', attachments: [] })
  expect(drafts.size).toBe(1)
  expect(drafts.get(id).subject).toBe('Updated')
  expect(attachments.get(id).attachments).toEqual([])
})

it('cleans up a confirmed submission but retains a draft edited since submission', async () => {
  const { db, rows, drafts } = database()
  const recovery = createComposeRecovery(db)
  const payload = { accountId: 1, subject: 'Original', content: 'body', attachments: [], requestId: 'attempt-one' }
  await recovery.save({ id: 'r1', accountId: 1, form: payload })
  const draftId = await persistDraft(db, payload)
  const originalVersion = await recovery.readDraftVersion(draftId)
  await recovery.clearSubmitted('r1', draftId, { ...payload, subject: 'Edited before sending' }, originalVersion)
  expect(drafts.size).toBe(0)
  await recovery.clearSubmitted('r1', null, payload)
  expect(rows.size).toBe(0)
  expect(drafts.size).toBe(0)

  const edited = { ...payload, subject: 'New edit', requestId: 'attempt-two' }
  await recovery.save({ id: 'r1', accountId: 1, form: edited })
  const editedId = await persistDraft(db, edited)
  await recovery.clearSubmitted('r1', editedId, payload, originalVersion)
  expect(rows.get('r1').form.subject).toBe('New edit')
  expect(drafts.get(editedId).subject).toBe('New edit')
})
