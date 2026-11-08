import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Content rule scan for the Gemini typed shock input sources: no em
 * dash, en dash, minus sign, or double hyphen may appear in the parser
 * or its unit tests (docs/architecture.md, content convention). The
 * patterns are assembled from code points so this file passes its own
 * scan, mirroring src/dashScan.test.ts without touching it.
 */

const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)
const MINUS_SIGN = String.fromCharCode(0x2212)
const DOUBLE_HYPHEN = '-'.repeat(2)

const FILES: readonly string[] = ['src/lib/shockParse.ts', 'src/lib/shockParse.test.ts']

describe('content rule: dash scan over the Gemini shock parse sources', () => {
  it('covers the parser and its unit tests', () => {
    expect(FILES).toContain('src/lib/shockParse.ts')
    expect(FILES).toContain('src/lib/shockParse.test.ts')
  })

  it('keeps dash code points and double hyphens out of every file', () => {
    const found: string[] = []
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, index) => {
        for (const character of [EM_DASH, EN_DASH, MINUS_SIGN]) {
          if (line.includes(character)) {
            found.push(`${file}:${index + 1}: dash code point in source`)
          }
        }
        if (line.includes(DOUBLE_HYPHEN)) {
          found.push(`${file}:${index + 1}: double hyphen: ${line.trim().slice(0, 120)}`)
        }
      })
    }
    expect(found).toEqual([])
  })
})
