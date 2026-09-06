export function messageNeighbors(list, id) {
  const index = list.findIndex(item => String(item.emailId) === String(id))
  return { index, previous: index > 0 ? list[index - 1] : null, next: index >= 0 ? list[index + 1] || null : null }
}

export function isEditingTarget(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"], .tox, [role="dialog"]')
}

export function clampListWidth(value, available) {
  return Math.round(Math.min(Math.max(Number(value) || 380, 300), Math.max(300, Math.min(560, available - 426))))
}

export function mailRouteSelection(route) {
  const sources = { '/inbox': 'email', '/starred': 'star', '/sent': 'send' }
  const source = sources[route.path] || (route.path === '/mail' && ['email', 'star', 'send'].includes(route.query?.source) ? route.query.source : null)
  const id = Number(route.query?.message)
  return source && Number.isSafeInteger(id) && id > 0 ? { source, id } : null
}
