import { expect, it } from 'vitest'
import { messageNeighbors, clampListWidth, isEditingTarget, mailRouteSelection } from '@/utils/mail-navigation.js'
import { parseRecipients } from '@/utils/recipients.js'

it('follows the displayed search/sort order and never wraps at a list boundary', () => {
  const list = [{ emailId: 4 }, { emailId: 9 }, { emailId: 2 }]
  expect(messageNeighbors(list, '9')).toMatchObject({ index: 1, previous: list[0], next: list[2] })
  expect(messageNeighbors(list, 4).previous).toBeNull()
  expect(messageNeighbors(list, 2).next).toBeNull()
  expect(messageNeighbors(list, 88)).toEqual({ index: -1, previous: null, next: null })
})
it('keeps readable space on both sides even for an invalid persisted width', () => {
  expect(clampListWidth(900, 900)).toBe(474)
  expect(clampListWidth(-200, 1200)).toBe(300)
  expect(clampListWidth('invalid', 1200)).toBe(380)
})
it('does not treat writing or dialog fields as shortcut targets', () => {
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog')
  const button = document.createElement('button'); dialog.append(button)
  expect(isEditingTarget(button)).toBe(true)
  expect(isEditingTarget(document.createElement('input'))).toBe(true)
  expect(isEditingTarget(document.createElement('button'))).toBe(false)
})
it('accepts multi-address paste, display names and duplicates without silently losing invalid input', () => {
  expect(parseRecipients('林 <lin@example.com>; a@example.com\nwrong address，A@EXAMPLE.COM', ['a@example.com']))
    .toEqual({ accepted: ['a@example.com', 'lin@example.com'], rejected: ['wrong address'] })
})
it('restores only valid owned message identifiers, with no admin scope from a URL', () => {
  expect(mailRouteSelection({ path: '/mail', query: { message: '12', source: 'star' } })).toEqual({ source: 'star', id: 12 })
  expect(mailRouteSelection({ path: '/inbox', query: { message: '12' } })).toEqual({ source: 'email', id: 12 })
  for (const query of [{ message: '12', source: 'admin' }, { message: '-1', source: 'email' }, { message: 'NaN', source: 'email' }]) {
    expect(mailRouteSelection({ path: '/mail', query })).toBeNull()
  }
})
