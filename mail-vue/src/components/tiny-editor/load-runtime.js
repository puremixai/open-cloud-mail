let pendingLoad

// A single script request is shared by all mounted composers. Failed loads can retry.
export function loadTinyMCE() {
  if (window.tinymce) return Promise.resolve(window.tinymce)
  if (pendingLoad) return pendingLoad
  pendingLoad = new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-mail-tinymce]')
    const created = !script
    if (!script) {
      script = document.createElement('script')
      script.src = '/tinymce/tinymce.min.js'
      script.dataset.mailTinymce = 'true'
    }
    const cleanup = () => {
      clearTimeout(timeout)
      script.removeEventListener('load', loaded)
      script.removeEventListener('error', failed)
    }
    const failed = () => {
      cleanup()
      script.remove()
      pendingLoad = undefined
      reject(new Error('Editor script could not be loaded'))
    }
    const loaded = () => {
      if (!window.tinymce) { failed(); return }
      cleanup()
      resolve(window.tinymce)
    }
    const timeout = setTimeout(failed, 30000)
    script.addEventListener('load', loaded)
    script.addEventListener('error', failed)
    if (created) document.head.appendChild(script)
  })
  return pendingLoad
}
