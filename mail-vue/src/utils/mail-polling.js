import { onMounted, onActivated, onDeactivated, onUnmounted, watch } from 'vue'

// Only schedule the next poll after the current request settles. Context changes
// invalidate callbacks even when an adapter/server ignores AbortSignal.
export function useMailPolling(poll, delay, context) {
    let active = false, generation = 0, timer, controller
    function cancel() {
        generation++
        clearTimeout(timer)
        controller?.abort()
    }
    function schedule() {
        const epoch = generation
        timer = setTimeout(async () => {
            const request = new AbortController()
            controller = request
            const valid = () => active && epoch === generation && !request.signal.aborted
            try { if (valid()) await poll(request.signal, valid) } catch { /* retry on next interval */ }
            finally { if (valid()) schedule() }
        }, Math.max(100, delay()))
    }
    function start() { if (active) return; active = true; schedule() }
    function stop() { active = false; cancel() }
    onMounted(start)
    onActivated(start)
    onDeactivated(stop)
    onUnmounted(stop)
    watch(context, () => { cancel(); if (active) schedule() }, { flush: 'sync' })
}
