// Recovery may restore an uncertain attempt; edits still receive a fresh id.
const fields = ['accountId', 'name', 'sendEmail', 'sendType', 'emailId', 'receiveEmail', 'text', 'content', 'subject', 'attachments']
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]))
    return value
}
export function sendSignature(form) {
    // Only outgoing fields participate; local draft ids and list decorations
    // must not change the payload sent on an unchanged, recovered retry.
    return JSON.stringify(canonical(Object.fromEntries(fields.filter(key => form[key] !== undefined).map(key => [key, form[key]]))))
}
export function createSendAttempt() {
    let previous = '', requestId = ''
    return {
        prepare(form) {
            const signature = sendSignature(form)
            if (!requestId || signature !== previous) requestId = crypto.randomUUID()
            previous = signature
            return { ...JSON.parse(signature), requestId }
        },
        restore(form) {
            const savedId = form.requestId
            previous = savedId ? sendSignature(form) : ''
            requestId = savedId || ''
        },
        reset() { previous = ''; requestId = '' },
    }
}
