import { isEmail } from './verify-utils.js'

export function parseRecipients(value, existing = []) {
  const accepted = [...existing], rejected = []
  const known = new Set(existing.map(address => address.toLowerCase()))
  for (const part of String(value || '').split(/[,，;；\n\r]+/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const address = trimmed.match(/<([^<>]+)>$/)?.[1]?.trim() || trimmed
    if (!isEmail(address)) { rejected.push(trimmed); continue }
    if (!known.has(address.toLowerCase())) { accepted.push(address); known.add(address.toLowerCase()) }
  }
  return { accepted, rejected }
}
