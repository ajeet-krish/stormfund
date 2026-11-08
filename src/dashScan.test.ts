import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Content rule scan for the Phase E2, E3, and E4 sources
 * (docs/architecture.md): no em dash, en dash, minus sign, double
 * hyphen, or spaced hyphen may appear in anything these phases write
 * (UI copy, comments, JSX text). The three dash code points are checked
 * across the whole file because they can never be valid TypeScript; the
 * hyphen patterns are checked only in prose (comments, string and
 * template literals, JSX text) because a spaced hyphen is a legitimate
 * way to write subtraction in code. The patterns below are assembled
 * from code points so this file passes its own scan, and the numeric
 * minus inside formatted money stays allowed because it is a formatted
 * number, not copy.
 */

const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)
const MINUS_SIGN = String.fromCharCode(0x2212)
const DOUBLE_HYPHEN = '-'.repeat(2)
const SPACED_HYPHEN = [' ', '-', ' '].join('')

/** Prose characters a JSX text node may hold before we read it as copy. */
const PROSE = /^[\p{L}\p{N} .,:()'"/!?&+%-]+$/u

/** E2 through E4 files that do not live in an auto scanned directory. */
const EXPLICIT_FILES: readonly string[] = [
  'src/App.tsx',
  'src/app.smoke.test.ts',
  'src/dashScan.test.ts',
  'src/data/profiles.ts',
  'src/data/profiles.test.ts',
  'src/lib/forecast.test.ts',
  'src/lib/forecast.ts',
  'src/lib/format.ts',
  'src/lib/metrics.ts',
  'src/lib/planMath.golden.test.ts',
  'src/lib/planMath.test.ts',
  'src/lib/planMath.ts',
  'src/lib/planText.ts',
  'src/lib/planText.test.ts',
  'src/lib/shockPresets.ts',
  'src/lib/shocks.golden.test.ts',
  'src/lib/shocks.test.ts',
  'src/lib/shocks.ts',
  'src/lib/verdict.ts',
  'src/lib/verdict.test.ts',
]

/** Directories whose every source file is part of these phases. */
const AUTO_DIRS: readonly string[] = [
  'src/state',
  'src/components/console',
  'src/components/weather',
]

/** Stylesheets written this phase, scanned without the double hyphen rule. */
const CSS_FILES: readonly string[] = ['src/index.css']

function listDir(directory: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) {
      out.push(...listDir(path))
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

function targetFiles(): string[] {
  const paths = [...EXPLICIT_FILES]
  for (const directory of AUTO_DIRS) {
    paths.push(...listDir(directory))
  }
  return [...new Set(paths)].sort()
}

interface Prose {
  file: string
  line: number
  chunk: string
  where: string
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

/** Pull every piece of prose out of one source file. */
function proseOf(file: string, text: string): Prose[] {
  const prose: Prose[] = []
  let rest = text

  const push = (chunk: string, index: number, where: string): void => {
    prose.push({ file, line: lineOf(text, index), chunk, where })
  }

  // Block comments first, then line comments, so an apostrophe inside a
  // comment can never open a string that swallows real code.
  rest = rest.replace(/\/\*[\s\S]*?\*\//g, (chunk, index: number) => {
    push(chunk, index, 'block comment')
    return ' '
  })
  rest = rest.replace(/\/\/[^\n]*/g, (chunk, index: number) => {
    push(chunk, index, 'line comment')
    return ' '
  })

  const stringPattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  let match: RegExpExecArray | null
  while ((match = stringPattern.exec(rest)) !== null) {
    // Template expressions are code, not copy.
    const chunk = match[0].replace(/\$\{[^}]*\}/g, '')
    push(chunk, match.index, 'string literal')
  }
  rest = rest.replace(stringPattern, ' ')

  // JSX text nodes: prose between a tag close and the next tag open.
  const jsxPattern = />([^<>{}]+)</g
  while ((match = jsxPattern.exec(rest)) !== null) {
    const chunk = match[1] ?? ''
    if (PROSE.test(chunk) && /[A-Za-z]/.test(chunk)) {
      push(chunk, match.index, 'jsx text')
    }
  }

  return prose
}

function violationsIn(chunk: string): string[] {
  const problems: string[] = []
  if (chunk.includes(EM_DASH)) {
    problems.push('em dash')
  }
  if (chunk.includes(EN_DASH)) {
    problems.push('en dash')
  }
  if (chunk.includes(MINUS_SIGN)) {
    problems.push('minus sign')
  }
  if (chunk.includes(DOUBLE_HYPHEN)) {
    problems.push('double hyphen')
  }
  if (chunk.includes(SPACED_HYPHEN)) {
    problems.push('spaced hyphen')
  }
  return problems
}

describe('content rule: dash scan over the Phase E2, E3, and E4 sources', () => {
  const files = targetFiles()

  it('covers every file these phases wrote', () => {
    expect(files).toContain('src/components/console/ConsoleView.tsx')
    expect(files).toContain('src/state/consoleStore.ts')
    expect(files).toContain('src/lib/forecast.ts')
    expect(files).toContain('src/lib/forecast.test.ts')
    expect(files).toContain('src/components/weather/WeatherPanel.tsx')
    expect(files).toContain('src/components/weather/ForecastStrip.test.ts')
    expect(files).toContain('src/lib/planMath.ts')
    expect(files).toContain('src/lib/planMath.test.ts')
    expect(files).toContain('src/lib/planMath.golden.test.ts')
    expect(files).toContain('src/lib/planText.ts')
    expect(files).toContain('src/components/console/PlanCard.tsx')
    expect(files.length).toBeGreaterThanOrEqual(20)
  })

  it('keeps dash code points and dash copy out of every file', () => {
    const found: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      lines.forEach((line, index) => {
        for (const character of [EM_DASH, EN_DASH, MINUS_SIGN]) {
          if (line.includes(character)) {
            found.push(`${file}:${index + 1}: dash code point in source`)
          }
        }
      })
      for (const entry of proseOf(file, text)) {
        for (const problem of violationsIn(entry.chunk)) {
          const excerpt = entry.chunk.trim().slice(0, 120)
          found.push(`${file}:${entry.line}: ${problem} in ${entry.where}: ${excerpt}`)
        }
      }
    }
    expect(found).toEqual([])
  })

  it('keeps the console stylesheet free of dash copy', () => {
    // CSS is scanned too, with one exception: a custom property name
    // begins with two hyphens, which is syntax rather than copy, and CSS
    // holds no user facing copy beyond the comments checked here.
    const found: string[] = []
    for (const file of CSS_FILES) {
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      lines.forEach((line, index) => {
        for (const character of [EM_DASH, EN_DASH, MINUS_SIGN]) {
          if (line.includes(character)) {
            found.push(`${file}:${index + 1}: dash code point in source`)
          }
        }
        if (line.includes(SPACED_HYPHEN)) {
          found.push(`${file}:${index + 1}: spaced hyphen: ${line.trim().slice(0, 120)}`)
        }
      })
    }
    expect(found).toEqual([])
  })
})
