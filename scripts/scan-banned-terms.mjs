import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const bannedTerms = ['WSL2', 'Linux 子系统', 'kernel', '挂载', '容器']
const root = join(process.cwd(), 'src')
const ignoreFiles = new Set([
  join(root, 'copy', 'runtimeGuard.ts'),
  join(root, 'tests', 'banned-terms.test.ts'),
])

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const target = join(dir, entry)
    const stats = statSync(target)

    if (stats.isDirectory()) {
      return walk(target)
    }

    if (!/\.(ts|tsx)$/.test(target) || ignoreFiles.has(target)) {
      return []
    }

    return [target]
  })
}

const offenders = walk(root).flatMap((file) => {
  const content = readFileSync(file, 'utf8')
  return bannedTerms
    .filter((term) => content.includes(term))
    .map((term) => ({ file, term }))
})

if (offenders.length > 0) {
  console.error('Found banned user-facing terms:')
  for (const offender of offenders) {
    console.error(`- ${offender.term}: ${offender.file}`)
  }
  process.exit(1)
}

console.log('No banned user-facing terms found.')
