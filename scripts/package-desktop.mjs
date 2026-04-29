import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const forcedUnsigned = process.argv.includes('--unsigned')
const forcedSigned = process.argv.includes('--signed')
const installerPath = resolve('release', 'AgentSecurity Setup.exe')
const shaPath = `${installerPath}.sha256`
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const electronBuilderCli = resolve('node_modules', 'electron-builder', 'cli.js')
const hasSigningMaterial =
  (Boolean(process.env.CSC_LINK?.trim()) && Boolean(process.env.CSC_KEY_PASSWORD?.trim())) ||
  (Boolean(process.env.WIN_CSC_LINK?.trim()) && Boolean(process.env.WIN_CSC_KEY_PASSWORD?.trim())) ||
  Boolean(process.env.CSC_NAME?.trim())
const unsigned = forcedUnsigned || (!forcedSigned && !hasSigningMaterial)

if (forcedSigned && !hasSigningMaterial) {
  await run('node', ['scripts/assert-windows-signing.mjs'])
}

if (unsigned && !forcedUnsigned) {
  process.stderr.write(
    'Windows signing material was not found; building an unsigned installer and recording SHA256 only.\n',
  )
}

await run(npmBin, ['run', 'build:desktop'])

const electronBuilderArgs = ['--win', 'nsis', '--publish', 'never']
if (unsigned) {
  electronBuilderArgs.push(
    '--config.win.signAndEditExecutable=false',
    '--config.win.forceCodeSigning=false',
  )
}

await run(
  'node',
  [electronBuilderCli, ...electronBuilderArgs],
  unsigned
    ? {
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      }
    : {},
)

const sha256 = createHash('sha256')
  .update(await readFile(installerPath))
  .digest('hex')
await writeFile(
  shaPath,
  `${sha256}  ${join('.', 'AgentSecurity Setup.exe')}\n`,
  'utf8',
)

if (!unsigned) {
  await run('node', ['scripts/verify-windows-signature.mjs', installerPath])
}

process.stdout.write(`${installerPath}\n${shaPath}\n`)

async function run(command, args, extraEnv = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: 'inherit',
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
    })

    child.once('error', rejectRun)
    child.once('exit', (code) => {
      if (code === 0) {
        resolveRun(undefined)
        return
      }
      rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`))
    })
  })
}
