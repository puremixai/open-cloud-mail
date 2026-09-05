// Each Dexie database belongs to one signed-in user. Serialize mutations across
// repository instances so an old in-flight save cannot resurrect a removed item.
import { sendSignature } from './send-attempt.js'
const queues = new WeakMap()
const snapshot = value => JSON.parse(JSON.stringify(value))
export const draftVersion = draft => JSON.stringify([sendSignature(draft), draft.createTime || '', draft.requestId || ''])

export function createComposeRecovery(database) {
    function enqueue(operation) {
        const pending = (queues.get(database) || Promise.resolve()).then(operation)
        queues.set(database, pending.catch(() => {}))
        return pending
    }
    return {
        save(record) {
            const value = snapshot(record)
            return enqueue(() => database.recovery.put(value))
        },
        remove(id) { return enqueue(() => database.recovery.delete(id)) },
        async readDraftVersion(id) {
            await queues.get(database)
            const draft = await database.draft.get(id)
            if (!draft) return null
            const att = await database.att.get(id)
            return draftVersion({ ...draft, attachments: att?.attachments || [] })
        },
        clearSubmitted(id, draftId, payload, originalDraftVersion) {
            const sent = snapshot(payload)
            return enqueue(() => database.transaction('rw', database.recovery, database.draft, database.att, async () => {
                const recovery = await database.recovery.get(id)
                if (recovery?.form.requestId === sent.requestId && sendSignature(recovery.form) === sendSignature(sent)) await database.recovery.delete(id)
                if (draftId == null) return
                const draft = await database.draft.get(draftId)
                if (!draft) return
                const attachment = await database.att.get(draftId)
                if (!originalDraftVersion || draftVersion({ ...draft, attachments: attachment?.attachments || [] }) !== originalDraftVersion) return
                await database.draft.delete(draftId)
                await database.att.delete(draftId)
            }))
        },
        async list(accountId) {
            await queues.get(database)
            return (await database.recovery.toArray())
                .filter(record => record.accountId === accountId)
                .sort((a, b) => b.updatedAt - a.updatedAt)
        },
    }
}

export async function persistDraft(database, form) {
    const { draftId, attachments = [], ...draft } = snapshot(form)
    // Keep a prior attempt so saving/reopening an uncertain send is still a retry.
    draft.createTime = new Date().toISOString().slice(0, 19).replace('T', ' ')
    return database.transaction('rw', database.draft, database.att, async () => {
        const id = draftId == null
            ? await database.draft.add(draft)
            : await database.draft.put({ ...draft, draftId })
        await database.att.put({ draftId: id, attachments })
        return id
    })
}
