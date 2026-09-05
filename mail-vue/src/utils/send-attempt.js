// Kept in the composer instance only; no body or attempt is persisted to storage.
export function createSendAttempt() {
    let previous = '', requestId = ''
    return {
        prepare(form) {
            const { requestId: ignored, ...payload } = form
            const signature = JSON.stringify(payload)
            if (!requestId || signature !== previous) requestId = crypto.randomUUID()
            previous = signature
            return { ...JSON.parse(signature), requestId }
        },
        reset() { previous = ''; requestId = '' },
    }
}
