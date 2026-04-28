import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const requiredFiles = [
  'docs/go-no-go.md',
  'docs/real-machine-validation-template.md',
  'docs/release-evidence-template.json',
  'docs/release-checklist.md',
  'docs/release-notes-v1.0.0-local.md',
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
  agent: resolve(assetRoot, 'agent-security-agent.pkg'),
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

  if (!evidence.bundledArtifacts?.rootfs || !evidence.bundledArtifacts?.agent) {
    throw new Error('bundledArtifacts.rootfs and bundledArtifacts.agent are required.')
  }
  validateBundledAssetPath('rootfs', evidence.bundledArtifacts.rootfs)
  validateBundledAssetPath('agent', evidence.bundledArtifacts.agent)

  const rootfsChecksum =
    evidence.bundledArtifacts.checksums?.rootfsSha256 ??
    evidence.bundledArtifacts.rootfsSha256
  const agentChecksum =
    evidence.bundledArtifacts.checksums?.agentSha256 ??
    evidence.bundledArtifacts.agentSha256 ??
    evidence.bundledArtifacts.checksum

  validateSha256('bundledArtifacts.checksums.rootfsSha256', rootfsChecksum)
  validateSha256('bundledArtifacts.checksums.agentSha256', agentChecksum)
  await validateAssetChecksum('rootfs', rootfsChecksum)
  await validateAssetChecksum('agent', agentChecksum)
  validateManifestBinding(evidence, manifest, rootfsChecksum, agentChecksum)

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
  if (evidence.bundledArtifacts?.updatePolicy !== 'bundled-only') {
    throw new Error('bundledArtifacts.updatePolicy must be "bundled-only".')
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

function validateManifestBinding(evidence, manifest, rootfsChecksum, agentChecksum) {
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
  if (manifest.updatePolicy !== 'bundled-only') {
    throw new Error('Asset manifest updatePolicy must be "bundled-only".')
  }
  if (manifest.artifacts?.rootfs?.path !== 'bridge/assets/agent-security-rootfs.tar') {
    throw new Error('Asset manifest rootfs path must be fixed.')
  }
  if (manifest.artifacts?.agent?.path !== 'bridge/assets/agent-security-agent.pkg') {
    throw new Error('Asset manifest agent path must be fixed.')
  }
  if (manifest.artifacts?.rootfs?.sha256 !== rootfsChecksum.toLowerCase()) {
    throw new Error('Asset manifest rootfs checksum must match evidence.')
  }
  if (manifest.artifacts?.agent?.sha256 !== agentChecksum.toLowerCase()) {
    throw new Error('Asset manifest agent checksum must match evidence.')
  }
}

function isRealValue(value) {
  return typeof value === 'string' && !placeholderValues.has(value.trim())
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

function formatPathForMessage(path) {
  return path.replaceAll('\\', '/')
}
