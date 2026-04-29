import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const forcedUnsigned = process.argv.includes('--unsigned')
const forcedSigned = process.argv.includes('--signed')
const installerPath = resolve('release', 'AgentSecurity Setup.exe')
const shaPath = `${installerPath}.sha256`
const packagedManifestPath = resolve('release', 'win-unpacked', 'resources', 'bridge-assets', 'release-assets-manifest.json')
const installedManifestPath = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Programs', 'agentsecurity', 'resources', 'bridge-assets', 'release-assets-manifest.json')
  : ''
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const electronBuilderCli = resolve('node_modules', 'electron-builder', 'cli.js')
const hasSigningMaterial =
  (Boolean(process.env.CSC_LINK?.trim()) && Boolean(process.env.CSC_KEY_PASSWORD?.trim())) ||
  (Boolean(process.env.WIN_CSC_LINK?.trim()) && Boolean(process.env.WIN_CSC_KEY_PASSWORD?.trim())) ||
  Boolean(process.env.CSC_NAME?.trim())
const unsigned = forcedUnsigned || (!forcedSigned && !hasSigningMaterial)

if (forcedSigned && !hasSigningMaterial) {
  await run(process.execPath, ['scripts/assert-windows-signing.mjs'])
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
  process.execPath,
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

await verifyInstalledAssetsAreNotStale()

if (!unsigned) {
  await run(process.execPath, ['scripts/verify-windows-signature.mjs', installerPath])
}

process.stdout.write(`${installerPath}\n${shaPath}\n`)

async function verifyInstalledAssetsAreNotStale() {
  if (!installedManifestPath) {
    return
  }

  let packagedManifest
  let installedManifest
  try {
    packagedManifest = JSON.parse(await readFile(packagedManifestPath, 'utf8'))
    installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'))
  } catch {
    return
  }

  if (JSON.stringify(packagedManifest) !== JSON.stringify(installedManifest)) {
    if (installedManifest.version !== packagedManifest.version) {
      process.stderr.write(
        `Installed AgentSecurity assets are from ${installedManifest.version}; packaged assets are ${packagedManifest.version}. Install the new Setup.exe before final release validation.\n`,
      )
      return
    }

    throw new Error(
      `Installed AgentSecurity assets are stale: installed ${installedManifest.version}, packaged ${packagedManifest.version}. Run the new installer or remove the old installation before release validation.`,
    )
  }
}

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
