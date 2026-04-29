import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const requiredFiles = [
  'docs/go-no-go.md',
  'docs/real-machine-validation-template.md',
  'docs/release-evidence-template.json',
  'docs/release-checklist.md',
  'docs/release-notes-v1.0.0-wsl2.md',
  'docs/safety-boundary.md',
  'docs/install-guide.md',
  'docs/risk-explanation.md',
  'docs/uninstall.md',
  'docs/recovery-guide.md',
  'docs/support-guide.md',
  'docs/bundled-assets-spec.md',
  'docs/exception-matrix-validation.md',
  'bridge/assets/README.md',
  'bridge/assets/release-assets-manifest.json',
]

const requiredLifecycleActions = [
  'install',
  'start_agent',
  'stop_agent',
  'rebuild_environment',
  'delete_environment',
]

const blockingExceptionCases = [
  'permission_denied',
  'artifact_missing',
  'checksum_mismatch',
  'delete_failure',
]

const documentedLimitationCases = [
  'wsl_disabled',
  'reboot_interrupted',
  'startup_failure',
]

const assetRoot = process.env.AGENT_SECURITY_RELEASE_ASSET_ROOT || 'bridge/assets'
const requiredAssetPaths = {
  rootfs: resolve(assetRoot, 'agent-security-rootfs.tar'),
  agent: resolve(assetRoot, 'openclaw-agent.pkg'),
  bootstrap: resolve(assetRoot, 'openclaw-bootstrap.sh'),
  nodeRuntime: resolve(assetRoot, 'node-v24.15.0-linux-x64.tar.xz'),
  openClawNpmTarball: resolve(assetRoot, 'openclaw-2026.4.26.tgz'),
}
const sha256Pattern = /^[0-9a-f]{64}$/i
const placeholderValues = new Set(['REPLACE_ME', 'NOT_VALIDATED', 'missing', ''])

for (const file of requiredFiles) {
  try {
    await access(file)
  } catch {
    console.error(`Missing required release candidate artifact: ${file}`)
    process.exit(1)
  }
}

try {
  JSON.parse(await readFile('docs/release-evidence-template.json', 'utf8'))
} catch (error) {
  console.error('Release evidence template is not valid JSON.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const evidencePath = parseEvidencePath(process.argv.slice(2))
if (evidencePath) {
  try {
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
    const manifest = JSON.parse(await readFile(resolve(assetRoot, 'release-assets-manifest.json'), 'utf8'))
    await validateReleaseEvidence(evidence, manifest)
    console.log('Release candidate evidence passed live gating checks.')
  } catch (error) {
    console.error('Release evidence failed public launch checks.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

console.log('Release candidate documentation artifacts are present.')
console.log(
  evidencePath
    ? 'Manual gate: release evidence is complete; publish approval may proceed.'
    : 'Manual gate: real Windows validation must still be completed in live mode.',
)

function parseEvidencePath(argv) {
  const index = argv.indexOf('--evidence')
  if (index === -1) {
    return undefined
  }

  const path = argv[index + 1]
  if (!path) {
    throw new Error('--evidence requires a file path.')
  }

  return path
}

async function validateReleaseEvidence(evidence, manifest) {
  if (evidence.executionMode !== 'live') {
    throw new Error('executionMode must be "live" for public launch evidence.')
  }

  if (evidence.targetDistro !== 'AgentSecurity') {
    throw new Error('targetDistro must be "AgentSecurity" for public launch evidence.')
  }

  if (!evidence.bundledArtifacts?.rootfs || !evidence.bundledArtifacts?.agent || !evidence.bundledArtifacts?.bootstrap) {
    throw new Error('bundledArtifacts.rootfs, bundledArtifacts.agent, and bundledArtifacts.bootstrap are required.')
  }
  validateBundledAssetPath('rootfs', evidence.bundledArtifacts.rootfs)
  validateBundledAssetPath('agent', evidence.bundledArtifacts.agent)
  validateBundledAssetPath('bootstrap', evidence.bundledArtifacts.bootstrap)

  const rootfsChecksum =
    evidence.bundledArtifacts.checksums?.rootfsSha256 ??
    evidence.bundledArtifacts.rootfsSha256
  const agentChecksum =
    evidence.bundledArtifacts.checksums?.agentSha256 ??
    evidence.bundledArtifacts.agentSha256 ??
    evidence.bundledArtifacts.checksum
  const bootstrapChecksum =
    evidence.bundledArtifacts.checksums?.bootstrapSha256 ??
    evidence.bundledArtifacts.bootstrapSha256

  validateSha256('bundledArtifacts.checksums.rootfsSha256', rootfsChecksum)
  validateSha256('bundledArtifacts.checksums.agentSha256', agentChecksum)
  validateSha256('bundledArtifacts.checksums.bootstrapSha256', bootstrapChecksum)
  await validateAssetChecksum('rootfs', rootfsChecksum)
  await validateAssetChecksum('agent', agentChecksum)
  await validateAssetChecksum('bootstrap', bootstrapChecksum)
  await validateReleaseRootfs(requiredAssetPaths.rootfs)
  validateManifestBinding(evidence, manifest, rootfsChecksum, agentChecksum, bootstrapChecksum)
  await validateAssetChecksum('nodeRuntime', manifest.artifacts.nodeRuntime.sha256)
  await validateAssetChecksum('openClawNpmTarball', manifest.artifacts.openClawNpmTarball.sha256)
  await validateWindowsInstaller(evidence)

  if (!isRealValue(evidence.candidateVersion)) {
    throw new Error('candidateVersion is required.')
  }
  if (!isRealValue(evidence.commit)) {
    throw new Error('commit is required.')
  }
  if (!isRealValue(evidence.bundledArtifacts?.version)) {
    throw new Error('bundledArtifacts.version is required.')
  }
  if (!isRealValue(evidence.bundledArtifacts?.source)) {
    throw new Error('bundledArtifacts.source is required.')
  }
  if (evidence.bundledArtifacts?.updatePolicy !== 'mostly-bundled') {
    throw new Error('bundledArtifacts.updatePolicy must be "mostly-bundled".')
  }
  if (!isUbuntu2404RootfsSource(evidence.bundledArtifacts?.source)) {
    throw new Error('bundledArtifacts.source must identify a real Ubuntu 24.04 LTS rootfs, not a development placeholder.')
  }
  if (evidence.bundledArtifacts?.ubuntuVersion !== '24.04-lts') {
    throw new Error('bundledArtifacts.ubuntuVersion must be "24.04-lts".')
  }
  if (evidence.bundledArtifacts?.nodeVersion !== '24') {
    throw new Error('bundledArtifacts.nodeVersion must be "24".')
  }
  if (evidence.bundledArtifacts?.openClawInstallSource !== 'npm') {
    throw new Error('bundledArtifacts.openClawInstallSource must be "npm".')
  }
  if (evidence.bundledArtifacts?.openClawVersionPolicy !== 'latest') {
    throw new Error('bundledArtifacts.openClawVersionPolicy must be "latest".')
  }

  if (Array.isArray(evidence.shimmedCommands) && evidence.shimmedCommands.length > 0) {
    throw new Error('shimmedCommands must be empty for public launch evidence.')
  }

  for (const action of requiredLifecycleActions) {
    const step = evidence.lifecycle?.find((item) => item.action === action)
    if (!step) {
      throw new Error(`Missing required lifecycle evidence for action "${action}".`)
    }
    if (step.finalStatus !== 'succeeded') {
      throw new Error(`Lifecycle action "${action}" did not succeed.`)
    }
  }

  validateExceptionMatrix(evidence)

  for (const exceptionCase of blockingExceptionCases) {
    const item = evidence.exceptionValidation?.find((entry) => entry.case === exceptionCase)
    if (!item) {
      throw new Error(`Missing blocking exception validation for "${exceptionCase}".`)
    }
    if (
      !isRealValue(item.triggerMethod) ||
      !isRealValue(item.errorCode) ||
      !isRealValue(item.userVisibleMessage) ||
      !isRealValue(item.recommendedRecovery) ||
      !isRealValue(item.actualRecoveryResult)
    ) {
      throw new Error(`Blocking exception validation for "${exceptionCase}" is incomplete.`)
    }
    if (!item.evidence || placeholderValues.has(String(item.evidence).trim())) {
      throw new Error(`Blocking exception validation for "${exceptionCase}" is missing evidence.`)
    }
  }

  for (const limitationCase of documentedLimitationCases) {
    const item = evidence.exceptionValidation?.find((entry) => entry.case === limitationCase)
    if (!item) {
      throw new Error(`Missing documented limitation entry for "${limitationCase}".`)
    }
    if (!isRealValue(item.userVisibleMessage) || !isRealValue(item.recommendedRecovery)) {
      throw new Error(`Documented limitation entry for "${limitationCase}" is incomplete.`)
    }
    if (!isRealValue(item.documentationReference)) {
      throw new Error(`Documented limitation entry for "${limitationCase}" requires documentationReference.`)
    }
  }

  if (evidence.supportBundleChecks?.containsBridgeToken !== false) {
    throw new Error('Support bundle evidence indicates bridge token leakage.')
  }
  if (evidence.supportBundleChecks?.containsLocalAppDataPath !== false) {
    throw new Error('Support bundle evidence indicates host path leakage.')
  }
  if (evidence.supportBundleChecks?.containsAuthorizationHeader !== false) {
    throw new Error('Support bundle evidence indicates authorization header leakage.')
  }
  if (evidence.supportBundleChecks?.containsRedactedMarkers !== true) {
    throw new Error('Support bundle evidence must prove redaction markers are present.')
  }

  if (evidence.residualItems?.distroPresentAfterDelete !== false) {
    throw new Error('Delete evidence must confirm the dedicated distro is gone after uninstall.')
  }
  if (!Array.isArray(evidence.residualItems?.remainingWindowsPaths)) {
    throw new Error('residualItems.remainingWindowsPaths must be recorded.')
  }
  if (!Array.isArray(evidence.residualItems?.removedWindowsPaths)) {
    throw new Error('residualItems.removedWindowsPaths must be recorded.')
  }
  if (!Array.isArray(evidence.residualItems?.logsRetainedForSupport)) {
    throw new Error('residualItems.logsRetainedForSupport must be recorded.')
  }
  if (!Array.isArray(evidence.residualItems?.unexpectedResidue)) {
    throw new Error('residualItems.unexpectedResidue must be recorded.')
  }

  if (evidence.goNoGo?.decision !== 'go') {
    throw new Error('goNoGo.decision must be "go" before public launch.')
  }
}

function validateExceptionMatrix(evidence) {
  const matrix = evidence.exceptionMatrix
  if (!matrix?.blocking || !matrix?.documentedLimitations) {
    throw new Error('exceptionMatrix.blocking and exceptionMatrix.documentedLimitations are required.')
  }

  for (const exceptionCase of blockingExceptionCases) {
    const item = matrix.blocking[exceptionCase]
    if (!item || item.required !== true || item.status !== 'validated') {
      throw new Error(`exceptionMatrix.blocking.${exceptionCase} must be marked required=true and status="validated".`)
    }
  }

  for (const limitationCase of documentedLimitationCases) {
    const item = matrix.documentedLimitations[limitationCase]
    if (!item || item.required !== false || item.status !== 'documented') {
      throw new Error(`exceptionMatrix.documentedLimitations.${limitationCase} must be marked required=false and status="documented".`)
    }
    if (!isRealValue(item.documentationReference) || !isRealValue(item.recoverySummary)) {
      throw new Error(`exceptionMatrix documented limitation "${limitationCase}" requires documentationReference and recoverySummary.`)
    }
  }
}

function validateManifestBinding(evidence, manifest, rootfsChecksum, agentChecksum, bootstrapChecksum) {
  const agentArtifact = manifest.artifacts?.agentPackage ?? manifest.artifacts?.agent
  const nodeRuntimeArtifact = manifest.artifacts?.nodeRuntime
  const openClawNpmTarballArtifact = manifest.artifacts?.openClawNpmTarball
  if (!manifest) {
    throw new Error('release-assets-manifest.json is required for public launch evidence.')
  }
  if (manifest.sourceCommit !== evidence.commit) {
    throw new Error(
      `Asset manifest sourceCommit (${manifest.sourceCommit ?? 'missing'}) must match evidence commit (${evidence.commit}).`,
    )
  }
  if (manifest.version !== evidence.bundledArtifacts.version) {
    throw new Error('Asset manifest version must match bundledArtifacts.version.')
  }
  if (manifest.updatePolicy !== 'mostly-bundled') {
    throw new Error('Asset manifest updatePolicy must be "mostly-bundled".')
  }
  if (!isUbuntu2404RootfsSource(manifest.source)) {
    throw new Error('Asset manifest source must identify a real Ubuntu 24.04 LTS rootfs, not a development placeholder.')
  }
  if (manifest.ubuntuVersion !== '24.04-lts') {
    throw new Error('Asset manifest ubuntuVersion must be "24.04-lts".')
  }
  if (manifest.nodeVersion !== '24') {
    throw new Error('Asset manifest nodeVersion must be "24".')
  }
  if (manifest.openClawInstallSource !== 'npm') {
    throw new Error('Asset manifest openClawInstallSource must be "npm".')
  }
  if (manifest.openClawVersionPolicy !== 'latest') {
    throw new Error('Asset manifest openClawVersionPolicy must be "latest".')
  }
  if (manifest.artifacts?.rootfs?.path !== 'bridge/assets/agent-security-rootfs.tar') {
    throw new Error('Asset manifest rootfs path must be fixed.')
  }
  if (agentArtifact?.path !== 'bridge/assets/openclaw-agent.pkg') {
    throw new Error('Asset manifest agent path must be fixed.')
  }
  if (manifest.agentName !== 'OpenClaw') {
    throw new Error('Asset manifest agentName must be "OpenClaw" for the public Windows release.')
  }
  if (manifest.artifacts?.bootstrap?.path !== 'bridge/assets/openclaw-bootstrap.sh') {
    throw new Error('Asset manifest bootstrap path must be fixed.')
  }
  if (nodeRuntimeArtifact?.path !== 'bridge/assets/node-v24.15.0-linux-x64.tar.xz') {
    throw new Error('Asset manifest Node runtime path must be fixed.')
  }
  if (openClawNpmTarballArtifact?.path !== 'bridge/assets/openclaw-2026.4.26.tgz') {
    throw new Error('Asset manifest OpenClaw npm tarball path must be fixed.')
  }
  if (manifest.artifacts?.rootfs?.sha256 !== rootfsChecksum.toLowerCase()) {
    throw new Error('Asset manifest rootfs checksum must match evidence.')
  }
  if (agentArtifact?.sha256 !== agentChecksum.toLowerCase()) {
    throw new Error('Asset manifest agent checksum must match evidence.')
  }
  if (manifest.artifacts?.bootstrap?.sha256 !== bootstrapChecksum.toLowerCase()) {
    throw new Error('Asset manifest bootstrap checksum must match evidence.')
  }
  validateSha256('manifest.artifacts.nodeRuntime.sha256', nodeRuntimeArtifact?.sha256)
  validateSha256('manifest.artifacts.openClawNpmTarball.sha256', openClawNpmTarballArtifact?.sha256)
}

function isRealValue(value) {
  return typeof value === 'string' && !placeholderValues.has(value.trim())
}

function isUbuntu2404RootfsSource(value) {
  return (
    isRealValue(value) &&
    value.includes('ubuntu-24.04-lts') &&
    !value.includes('dev-busybox-placeholder') &&
    !value.includes('busybox')
  )
}

function validateBundledAssetPath(kind, value) {
  const expectedPath = requiredAssetPaths[kind]
  const receivedPath = resolve(value)
  if (receivedPath !== expectedPath) {
    throw new Error(
      `bundledArtifacts.${kind} must point to ${formatPathForMessage(expectedPath)}.`,
    )
  }
}

function validateSha256(field, value) {
  if (!value || value === 'dev-skip-checksum' || !sha256Pattern.test(value)) {
    throw new Error(`${field} must be a real 64-character SHA256 value.`)
  }
}

async function validateAssetChecksum(kind, expectedChecksum) {
  const path = requiredAssetPaths[kind]
  let content
  try {
    content = await readFile(path)
  } catch (error) {
    throw new Error(
      `Missing required bundled ${kind} artifact at ${formatPathForMessage(path)}.`,
    )
  }

  const actualChecksum = createHash('sha256').update(content).digest('hex')
  if (actualChecksum !== expectedChecksum.toLowerCase()) {
    throw new Error(
      `Bundled ${kind} checksum mismatch for ${basename(path)}: expected ${expectedChecksum.toLowerCase()} but received ${actualChecksum}.`,
    )
  }
}

async function validateReleaseRootfs(path) {
  let listing
  try {
    const { stdout } = await execFileAsync('tar', ['-tf', path], {
      maxBuffer: 16 * 1024 * 1024,
    })
    listing = stdout
  } catch (error) {
    throw new Error(`Unable to inspect rootfs tarball: ${error instanceof Error ? error.message : String(error)}`)
  }

  const entries = new Set(
    listing
      .split(/\r?\n/)
      .map((entry) => entry.replace(/^\.\//, '').replace(/\/$/, ''))
      .filter(Boolean),
  )
  const missing = [
    'etc/os-release',
    'usr/bin/apt-get',
    'usr/bin/tar',
    'usr/bin/sha256sum',
  ].filter((entry) => !entries.has(entry))
  if (missing.length > 0) {
    throw new Error(`Rootfs is missing required Ubuntu runtime files: ${missing.join(', ')}`)
  }
  if (!entries.has('usr/bin/xz') && !entries.has('bin/xz') && !entries.has('usr/lib/apt/apt-helper')) {
    throw new Error('Rootfs is missing xz support required for bundled Node.')
  }

  const text = await readRootfsText(path, [
    './etc/os-release',
    'etc/os-release',
    './usr/lib/os-release',
    'usr/lib/os-release',
  ])
  if (!/Ubuntu/i.test(text) || !/VERSION_ID="?24\.04"?/.test(text)) {
    throw new Error('Rootfs must identify as Ubuntu 24.04 in /etc/os-release.')
  }
}

async function readRootfsText(path, candidates) {
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync('tar', ['-xOf', path, candidate])
      if (stdout.trim()) {
        return stdout
      }
    } catch {
      // Try the next archive path spelling.
    }
  }
  throw new Error(`Unable to read rootfs file from candidates: ${candidates.join(', ')}`)
}

async function validateWindowsInstaller(evidence) {
  const installer = evidence.releaseArtifacts?.windowsInstaller
  if (!installer) {
    throw new Error('releaseArtifacts.windowsInstaller is required for public Windows EXE release evidence.')
  }
  if (!isRealValue(installer.path)) {
    throw new Error('releaseArtifacts.windowsInstaller.path is required.')
  }
  validateSha256('releaseArtifacts.windowsInstaller.sha256', installer.sha256)
  if (!['Valid', 'Unsigned'].includes(installer.signatureStatus)) {
    throw new Error('releaseArtifacts.windowsInstaller.signatureStatus must be "Valid" or "Unsigned".')
  }

  const installerPath = resolve(installer.path)
  let content
  try {
    content = await readFile(installerPath)
  } catch {
    throw new Error(`Missing Windows installer at ${formatPathForMessage(installerPath)}.`)
  }

  const actualChecksum = createHash('sha256').update(content).digest('hex')
  if (actualChecksum !== installer.sha256.toLowerCase()) {
    throw new Error(
      `Windows installer checksum mismatch for ${basename(installerPath)}: expected ${installer.sha256.toLowerCase()} but received ${actualChecksum}.`,
    )
  }

  if (installer.signatureStatus === 'Unsigned') {
    if (installer.signaturePolicy !== 'unsigned-accepted') {
      throw new Error('Unsigned Windows installer evidence requires signaturePolicy "unsigned-accepted".')
    }
    if (!isRealValue(installer.userVisibleInstallNote)) {
      throw new Error('Unsigned Windows installer evidence requires userVisibleInstallNote.')
    }
    return
  }

  await execFileAsync(process.execPath, ['scripts/verify-windows-signature.mjs', installerPath])
}

function formatPathForMessage(path) {
  return path.replaceAll('\\', '/')
}
