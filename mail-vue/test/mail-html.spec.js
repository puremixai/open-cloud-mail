// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeMailHtml } from '../src/utils/mail-html.js'

const raster = 'data:image/png;base64,iVBORw0KGgo='
function clean(html, options) {
  const result = sanitizeMailHtml(html, options)
  const content = document.createElement('div')
  content.append(result.fragment)
  return { ...result, content }
}

describe('email HTML policy', () => {
  it('removes executable HTML, namespaces, event handlers and active resource elements', () => {
    const { content } = clean(`<script>alert(1)</script><iframe srcdoc="<script>alert(2)</script>"></iframe>
      <object data="https://tracker.test"></object><embed src="https://tracker.test">
      <svg><a href="javascript:alert(1)">svg</a></svg><math><mi>x</mi></math>
      <form action="https://tracker.test"><input autofocus onfocus="alert(1)"></form>
      <link rel="stylesheet" href="https://tracker.test"><meta http-equiv="refresh" content="0;url=https://tracker.test">
      <video poster="https://tracker.test"><source src="https://tracker.test"></video>
      <img src="${raster}" onerror="alert(1)" onload="alert(2)"><p onclick="alert(1)">Hello</p>`)
    expect(content.querySelector('script,iframe,object,embed,svg,math,form,input,link,meta,video,source')).toBeNull()
    expect(content.querySelector('p').textContent).toBe('Hello')
    expect([...content.querySelectorAll('*')].flatMap(el => [...el.attributes]).some(a => /^on/i.test(a.name))).toBe(false)
  })

  it.each(['javascript:alert(1)', 'jav&#x09;ascript:alert(1)', 'data:text/html,hello', 'vbscript:msgbox(1)', 'file:///secret', '//evil.test', '/api/delete'])('rejects unsafe or ambiguous link %s', href => {
    expect(clean(`<a href="${href}" target="_self" ping="https://tracker.test">link</a>`).content.querySelector('a').hasAttribute('href')).toBe(false)
  })

  it('keeps explicit web and mail links with safe browsing attributes', () => {
    const { content } = clean('<a href="https://example.test/path" target="_top" rel="opener" ping="https://tracker.test">web</a><a href="mailto:person@example.test">mail</a>')
    expect(content.querySelectorAll('a[href]')).toHaveLength(2)
    for (const a of content.querySelectorAll('a')) {
      expect(a.target).toBe('_blank')
      expect(a.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
      expect(a.hasAttribute('ping')).toBe(false)
    }
  })

  it('preserves ordinary tables and safe body/inline styles without positioning or fetching CSS', () => {
    const { content, bodyStyle } = clean(`<html><head><style>@import 'https://tracker.test'; :host {position:fixed} td{background:url(https://tracker.test)}</style></head>
      <body style="color: #123456; padding: 12px; background-image:url(https://tracker.test)">
      <table width="600" cellpadding="4" style="border-collapse:collapse; width:600px"><tr><td colspan="2" style="color:red; background-color:#fff; padding:8px; border:1px solid black; font-size:16px; position:fixed; z-index:999999; background:url(https://tracker.test); transform:translate(10px)">Invoice</td></tr></table></body></html>`)
    expect(content.querySelector('style')).toBeNull()
    expect(content.querySelector('table').style.width).toBe('600px')
    const cell = content.querySelector('td')
    expect(cell.textContent).toBe('Invoice')
    expect(cell.getAttribute('colspan')).toBe('2')
    expect(cell.style.padding).toBe('8px')
    expect(cell.style.color).toBe('red')
    expect(cell.style.position).toBe('')
    expect(cell.style.transform).toBe('')
    expect(cell.style.backgroundImage).toBe('')
    expect(bodyStyle).toContain('padding: 12px')
    expect(bodyStyle).not.toMatch(/url|https/)
  })

  it('preserves both hiding and clipping on zero-height preheaders', () => {
    const { content } = clean('<div style="display:none;max-height:0;overflow:hidden">Preview only</div><p>Message</p>')
    const preheader = content.querySelector('div')
    expect(preheader.style.display).toBe('none')
    expect(preheader.style.maxHeight).toBe('0px')
    expect(preheader.style.overflow).toBe('hidden')
    expect(content.querySelector('p').textContent).toBe('Message')
  })

  it('preserves block lines and inline layout inside mail text', () => {
    const { content } = clean('<span style="display:BLOCK">First line</span><span style="display:block">Second line <b style="display:inline">bold</b><a style="display:inline-block" href="https://example.test">button</a></span>')
    expect([...content.querySelectorAll('span')].map(el => el.style.display)).toEqual(['block', 'block'])
    expect(content.querySelector('b').style.display).toBe('inline')
    expect(content.querySelector('a').style.display).toBe('inline-block')
  })

  it.each(['table', 'inline-table', 'table-row', 'table-cell', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-column', 'table-column-group', 'table-caption', 'list-item', 'flow-root'])('preserves safe display:%s layouts', display => {
    expect(clean(`<div style="display:${display}">content</div>`).content.querySelector('div').style.display).toBe(display)
  })

  it.each(['hidden', 'clip', 'auto', 'scroll', 'visible'])('preserves overflow and independent axes with %s', value => {
    const { content } = clean(`<div style="overflow:${value};overflow-x:${value};overflow-y:${value}">content</div>`)
    const style = content.querySelector('div').style
    expect(style.overflow).toBe(value)
    expect(style.overflowX).toBe(value)
    expect(style.overflowY).toBe(value)
  })

  it('preserves two-axis overflow shorthand', () => {
    expect(clean('<div style="overflow:hidden auto">content</div>').content.querySelector('div').style.overflow).toBe('hidden auto')
  })

  it.each(['url(https://tracker.test/pixel)', 'var(--layout)', 'expression(alert(1))', 'b\\6cock', 'block/**/', 'inherit', 'revert', 'bogus'])('rejects unvalidated display and overflow values: %s', value => {
    const { content } = clean(`<div style="display:${value};overflow:${value};overflow-x:${value};overflow-y:${value};color:red">text</div>`)
    const style = content.querySelector('div').style
    expect(style.display).toBe('')
    expect(style.overflow).toBe('')
    expect(style.overflowX).toBe('')
    expect(style.overflowY).toBe('')
    expect(style.color).toBe('red')
  })

  it('rejects multi-keyword display and invalid overflow token counts', () => {
    const { content } = clean('<div style="display:block none;overflow:hidden auto scroll;overflow-x:hidden auto;overflow-y:clip scroll">text</div>')
    expect(content.querySelector('div').getAttribute('style') || '').toBe('')
  })

  it.each([
    'background-image: u\\72l(https://tracker.test)',
    'background: image-set("https://tracker.test" 1x)',
    'color:var(--secret);--secret:url(https://tracker.test)',
    'width:expression(alert(1))',
    'background:u/**/rl(https://tracker.test)',
    'behavior:url(x);-moz-binding:url(x)',
    'position:absolute; inset:0; margin-top:-999px; opacity:0; filter:url(x)',
    'font-family:"</style><img src=x onerror=alert(1)>"',
  ])('drops unsafe inline CSS: %s', style => {
    const { content } = clean(`<div style='${style}'>body</div>`)
    expect(content.querySelector('div').getAttribute('style') || '').toBe('')
  })

  it('blocks image tracking through src, srcset, background and non-attachment local URLs', () => {
    const { content, hasRemoteImages } = clean('<img src="https://tracker.test/pixel" srcset="https://tracker.test/2 2x"><img src="/api/action"><table background="https://tracker.test/bg"><tr><td>x</td></tr></table>')
    expect(hasRemoteImages).toBe(true)
    expect(content.querySelector('[src], [srcset], [background]')).toBeNull()
  })

  it('allows only same-origin attachment URLs and raster data images without consent', () => {
    const attachment = `${window.location.origin}/api/oss/attachments/mail/photo.png?signature=abc&expires=123`
    const { content, hasRemoteImages } = clean(`<img src="${attachment}"><img src="${raster}"><img src="data:image/svg+xml;base64,PHN2Zz4=">`)
    expect(content.querySelectorAll('img')[0].getAttribute('src')).toBe(attachment)
    expect(content.querySelectorAll('img')[1].getAttribute('src')).toBe(raster)
    expect(content.querySelectorAll('img')[2].hasAttribute('src')).toBe(false)
    expect(hasRemoteImages).toBe(false)
  })

  it('loads HTTP(S) images only after consent, without accepting unsafe protocols or credentials', () => {
    const { content } = clean('<img src="https://tracker.test/pixel"><img src="javascript:alert(1)"><img src="data:image/svg+xml,xxx"><img src="https://user:pass@tracker.test/pixel"><img src="blob:https://tracker.test/id">', { allowRemoteImages: true })
    expect(content.querySelectorAll('[src]')).toHaveLength(1)
    expect(content.querySelector('img').getAttribute('src')).toBe('https://tracker.test/pixel')
    expect(content.querySelector('img').getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('does not trust lookalike origins or normalized traversal as local attachments', () => {
    const { content, hasRemoteImages } = clean(`<img src="https://evil.test/api/oss/attachments/a"><img src="${window.location.origin}/api/oss/attachments/../action"><img src="${window.location.origin}/api/oss/attachments-evil/a">`)
    expect(content.querySelector('[src]')).toBeNull()
    expect(hasRemoteImages).toBe(true)
  })

  it('supports signed root-relative attachments and gates protocol-relative images', () => {
    const html = '<img src="/api/oss/attachments/a?token=signed"><img src="//tracker.test/pixel">'
    const blocked = clean(html)
    expect(blocked.content.querySelector('img').src).toBe(`${window.location.origin}/api/oss/attachments/a?token=signed`)
    expect(blocked.content.querySelectorAll('img')[1].hasAttribute('src')).toBe(false)
    expect(clean(html, { allowRemoteImages: true }).content.querySelectorAll('img')[1].src).toBe('https://tracker.test/pixel')
    // Consent is per invocation, never retained in shared DOMPurify hooks.
    expect(clean(html).content.querySelectorAll('img')[1].hasAttribute('src')).toBe(false)
  })

  it('keeps resource CSS and HTML resource attributes blocked even after image consent', () => {
    const { content } = clean(`<style>@font-face{font-family:tracking;src:url(https://tracker.test/font)}</style>
      <div srcdoc="<script>alert(1)</script>" style="background-image:url(https://tracker.test/bg);color:rgb(10,20,30)">text</div>
      <img src="https://tracker.test/image" srcset="https://tracker.test/other 2x" style="background:url(https://tracker.test/bg)">`, { allowRemoteImages: true })
    expect(content.querySelector('style, [srcdoc], [srcset]')).toBeNull()
    expect(content.querySelector('div').style.color).toBe('rgb(10, 20, 30)')
    expect([...content.querySelectorAll('[style]')].some(el => /url|@font|tracker/.test(el.getAttribute('style')))).toBe(false)
  })

  it('handles malformed namespace and style breakout payloads without active nodes after insertion', () => {
    const { content } = clean(`<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>"></table></mtext></math>
      <svg><style><a id="</style><img src=x onerror=alert(2)>"></a></style></svg>
      <body style='color:red; </style><iframe srcdoc="evil"></iframe>'><p>Readable</p></body>`)
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.append(content)
    expect(shadow.querySelector('math, svg, script, style, iframe, [onerror], [srcdoc]')).toBeNull()
    expect(shadow.textContent).toContain('Readable')
  })
})
