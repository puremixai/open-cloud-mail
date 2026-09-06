import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const studentIdCardSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/views/idcard/index.vue'), 'utf8')

it('keeps the student ID page vertically scrollable inside the fixed mail layout', () => {
  expect(studentIdCardSource).toMatch(/\.sid-page\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow-y:\s*auto;/)
  expect(studentIdCardSource).toContain('-webkit-overflow-scrolling: touch;')
})
