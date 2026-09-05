import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { useMailPolling } from '@/utils/mail-polling.js'

it('aborts active polling on deactivation and starts exactly one loop on reactivation', async () => {
  vi.useFakeTimers()
  const visible = ref(true), context = ref(1)
  let complete, pendingSignal, isCurrent
  const poll = vi.fn((signal, valid) => {
    pendingSignal = signal; isCurrent = valid
    return new Promise(r => complete = r)
  })
  const child = defineComponent({ setup() { useMailPolling(poll, () => 100, () => context.value); return () => h('div') } })
  const host = defineComponent({ setup: () => () => h(KeepAlive, () => visible.value ? h(child) : null) })
  const wrapper = mount(host)
  await vi.advanceTimersByTimeAsync(100)
  expect(poll).toHaveBeenCalledTimes(1)
  visible.value = false; await nextTick()
  expect(pendingSignal.aborted).toBe(true)
  expect(isCurrent()).toBe(false)
  complete(); await flushPromises()
  await vi.advanceTimersByTimeAsync(500)
  expect(poll).toHaveBeenCalledTimes(1)
  visible.value = true; await nextTick(); await vi.advanceTimersByTimeAsync(100)
  expect(poll).toHaveBeenCalledTimes(2)
  context.value = 2; await nextTick()
  expect(pendingSignal.aborted).toBe(true)
  complete(); await flushPromises()
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})
