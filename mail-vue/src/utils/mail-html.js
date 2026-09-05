import createDOMPurify from 'dompurify'

const HTML_TAGS = 'a abbr b blockquote br caption center code col colgroup dd del div dl dt em font h1 h2 h3 h4 h5 h6 hr i img li ol p pre s small span strong sub sup table tbody td th thead tfoot tr u ul'.split(' ')
const HTML_ATTRS = 'href src alt title style width height align valign bgcolor color face size border cellpadding cellspacing colspan rowspan scope dir lang start type'.split(' ')
const CSS_PROPERTIES = new Set(`color background-color background font-family font-size font-style font-weight
  line-height letter-spacing word-spacing text-align text-decoration text-indent text-transform vertical-align
  white-space word-break overflow-wrap display overflow overflow-x overflow-y width min-width max-width height min-height max-height
  margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left
  border border-top border-right border-bottom border-left border-color border-style border-width
  border-top-color border-right-color border-bottom-color border-left-color
  border-top-style border-right-style border-bottom-style border-left-style
  border-top-width border-right-width border-bottom-width border-left-width border-radius
  border-collapse border-spacing table-layout caption-side list-style-type`.split(/\s+/))
const DISPLAY_VALUES = new Set(`none block inline inline-block flow-root list-item table inline-table
  table-row table-cell table-row-group table-header-group table-footer-group
  table-column table-column-group table-caption`.split(/\s+/))
const OVERFLOW_VALUES = new Set(['hidden', 'clip', 'auto', 'scroll', 'visible'])
const RASTER_DATA = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z\d+/]+={0,2}$/i
const CONTROLS = /[\u0000-\u0020\u007f]/

// A deliberately small CSS grammar: no escapes, comments, variables, arbitrary
// functions or positioned elements. A property allowlist alone cannot block URLs.
function sanitizeInlineStyle(raw) {
  const style = document.createElement('span').style
  for (const declaration of raw.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon < 0) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    let value = declaration.slice(colon + 1).trim()
    if (!CSS_PROPERTIES.has(property) || !value) continue
    if (/[\\{}<>@!\u0000-\u001f\u007f]/.test(value) || /\/\*|\*\//.test(value)) continue
    // Preserve hiding, clipping and normal flow without accepting arbitrary CSS
    // values or inherited layout rules. Only overflow shorthand takes two axes.
    if (property === 'display') {
      value = value.toLowerCase()
      if (!DISPLAY_VALUES.has(value)) continue
    } else if (/^overflow(?:-[xy])?$/.test(property)) {
      const keywords = value.toLowerCase().split(/\s+/)
      if (keywords.length > (property === 'overflow' ? 2 : 1) ||
          !keywords.every(keyword => OVERFLOW_VALUES.has(keyword))) continue
      value = keywords.join(' ')
    }
    const simpleValue = value.replace(/\b(?:rgba?|hsla?)\([\d\s.,%+/\-]+\)/gi, '')
    if (!/^[\p{L}\p{N}\s#%,.'"/\-]*$/u.test(simpleValue)) continue
    if (/(?:^|[^\w])-\s*(?:\d|\.)/.test(value)) continue
    style.setProperty(property, value)
  }
  return style.cssText
}

function webUrl(value) {
  if (CONTROLS.test(value) || value.includes('\\')) return null
  try {
    const url = new URL(value, window.location.origin)
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : null
  } catch {
    return null
  }
}

function safeLink(value) {
  if (CONTROLS.test(value) || value.includes('\\')) return false
  if (/^https?:\/\//i.test(value)) return Boolean(webUrl(value))
  return /^(?:mailto|tel):[^\s]+$/i.test(value)
}

/**
 * Sanitize before insertion into a live document. Never serialize/reparse the
 * returned fragment. Stylesheets are removed; safe body styles are returned
 * separately for the component's trusted wrapper.
 */
export function sanitizeMailHtml(html, { allowRemoteImages = false } = {}) {
  // An isolated instance prevents hooks/consent from affecting other consumers.
  const purifier = createDOMPurify(window)
  let hasRemoteImages = false
  purifier.addHook('uponSanitizeAttribute', (node, data) => {
    const tag = node.nodeName.toLowerCase()
    if (data.attrName === 'style') {
      data.attrValue = sanitizeInlineStyle(data.attrValue)
      data.keepAttr = Boolean(data.attrValue)
    } else if (data.attrName === 'href') {
      data.keepAttr = tag === 'a' && safeLink(data.attrValue)
    } else if (data.attrName === 'src') {
      data.keepAttr = false
      if (tag !== 'img') return
      const value = data.attrValue.trim()
      if (RASTER_DATA.test(value)) {
        data.keepAttr = true
        data.attrValue = value
        return
      }
      const url = webUrl(value)
      if (!url) return
      const attachment = url.origin === window.location.origin &&
        url.pathname.startsWith('/api/oss/attachments/') &&
        url.pathname.length > '/api/oss/attachments/'.length
      // Other relative URLs are not trusted to invoke application endpoints.
      if (!attachment && !/^(?:https?:)?\/\//i.test(value)) return
      if (!attachment) hasRemoteImages = true
      data.keepAttr = attachment || allowRemoteImages
      data.attrValue = url.href
    }
  })
  purifier.addHook('afterSanitizeAttributes', node => {
    if (node.nodeName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (node.nodeName === 'IMG') node.setAttribute('referrerpolicy', 'no-referrer')
  })
  const fragment = purifier.sanitize(html || '', {
    ALLOWED_TAGS: HTML_TAGS,
    ALLOWED_ATTR: HTML_ATTRS,
    // DOMPurify applies its URI regexp to non-URI attributes too. These carry
    // presentation only (style is independently filtered by our hook).
    ADD_URI_SAFE_ATTR: HTML_ATTRS.filter(name => name !== 'src' && name !== 'href'),
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|tel:)/i,
    FORBID_TAGS: ['style', 'svg', 'math', 'iframe', 'template'],
    WHOLE_DOCUMENT: true,
    RETURN_DOM_FRAGMENT: true,
  })
  const body = fragment.querySelector('body')
  const bodyStyle = body?.getAttribute('style') || ''
  // Only move already-sanitized nodes. Discard the head and document wrapper.
  fragment.replaceChildren(...(body ? [...body.childNodes] : []))
  return { fragment, bodyStyle, hasRemoteImages }
}
