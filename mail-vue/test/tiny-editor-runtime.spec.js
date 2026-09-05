import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  delete window.tinymce
  document.querySelectorAll('script[data-mail-tinymce]').forEach(script => script.remove())
  vi.resetModules()
})

it('shares one pending script between editors and permits retry after an error', async () => {
  const { loadTinyMCE } = await import('@/components/tiny-editor/load-runtime.js')
  const first = loadTinyMCE()
  const same = loadTinyMCE()
  expect(same).toBe(first)
  expect(document.querySelectorAll('script[data-mail-tinymce]')).toHaveLength(1)
  const rejection = expect(first).rejects.toThrow('could not be loaded')
  document.querySelector('script[data-mail-tinymce]').dispatchEvent(new Event('error'))
  await rejection
  const retry = loadTinyMCE()
  expect(document.querySelectorAll('script[data-mail-tinymce]')).toHaveLength(1)
  window.tinymce = { init() {} }
  document.querySelector('script[data-mail-tinymce]').dispatchEvent(new Event('load'))
  await expect(retry).resolves.toBe(window.tinymce)
})
