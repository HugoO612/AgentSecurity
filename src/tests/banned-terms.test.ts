import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('banned terms script', () => {
  it('keeps the scanner in place', () => {
    const script = readFileSync(
      join(process.cwd(), 'scripts', 'scan-banned-terms.mjs'),
      'utf8',
    )

    expect(script).toContain('WSL2')
    expect(script).toContain('Linux 子系统')
  })
})
