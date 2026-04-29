import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const tag = process.argv[2]
const installerPath = resolve('release', 'AgentSecurity Setup.exe')
const shaPath = `${installerPath}.sha256`

if (!tag) {
  throw new Error('Usage: npm run release:github -- <tag>')
}

let signatureStatus = 'Unsigned'
try {
  await execFileAsync(process.execPath, ['scripts/verify-windows-signature.mjs', installerPath])
  signatureStatus = 'Valid'
} catch {
  process.stderr.write(
    'Windows installer is unsigned; uploading with SHA256 verification only.\n',
  )
}

const installerBytes = await readFile(installerPath)
const expectedHash = createHash('sha256').update(installerBytes).digest('hex')
const shaText = await readFile(shaPath, 'utf8')

if (!shaText.toLowerCase().includes(expectedHash)) {
  throw new Error(`Installer SHA256 file does not contain ${expectedHash}.`)
}

await execFileAsync('gh', [
  'release',
  'upload',
  tag,
  installerPath,
  shaPath,
  '--clobber',
])

process.stdout.write(
  [
    `Uploaded Windows installer assets to GitHub Release ${tag} (${signatureStatus}):`,
    '- AgentSecurity Setup.exe',
    '- AgentSecurity Setup.exe.sha256',
  ].join('\n') + '\n',
)
