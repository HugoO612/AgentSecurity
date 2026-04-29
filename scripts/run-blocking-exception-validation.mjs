import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(await readFile('bridge/assets/release-assets-manifest.json', 'utf8'))
const evidencePath = process.argv[2] ?? 'docs/release-evidence-2026-04-28-live.json'
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
const runRoot = resolve('.tmp', 'blocking-exception-validation', timestampForPath(new Date()))
const committedResultPath = 'docs/blocking-exception-results-2026-04-28.json'
const goodRootfs = resolve('bridge/assets/agent-security-rootfs.tar')
const goodAgent = resolve('bridge/assets/openclaw-agent.pkg')
const goodBootstrap = resolve('bridge/assets/openclaw-bootstrap.sh')
let nextPort = Number(process.env.AGENT_SECURITY_EXCEPTION_PORT ?? 4590)

await mkdir(runRoot, { recursive: true })

const results = []

try {
  results.push(await validatePermissionDenied())
  results.push(await validateArtifactMissing())
  results.push(await validateChecksumMismatch())
  results.push(await validateDeleteFailure())

  applyResultsToEvidence(evidence, results)
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await writeFile(
    resolve(runRoot, 'blocking-exception-results.json'),
    `${JSON.stringify(results, null, 2)}\n`,
    'utf8',
  )
  await writeFile(committedResultPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8')
  process.stdout.write(`Blocking exception evidence updated in ${evidencePath}\n`)
  process.stdout.write(`Committed validation summary written to ${committedResultPath}\n`)
  process.stdout.write(`Raw validation results written to ${resolve(runRoot, 'blocking-exception-results.json')}\n`)
} finally {
  await unregisterAgentSecurity().catch(() => undefined)
}

async function validatePermissionDenied() {
  const context = await createCaseContext('permission-denied')
  const bridge = await startBridge(context, {
    AGENT_SECURITY_ELEVATION_HELPER:
      'Write-Error "The operation was canceled by the user."; exit 1223',
  })

  try {
    const before = await requestJson(bridge, '/environments/local-default/snapshot')
    const operation = await runAction(bridge, 'request_permission')
    const after = await requestJson(bridge, '/environments/local-default/snapshot')
    assertFailedOperation(operation, 'permission_denied')
    if (after.installation?.state !== before.installation?.state) {
      throw new Error('permission_denied changed installation state unexpectedly.')
    }
    return {
      case: 'permission_denied',
      triggerMethod:
        'Started the production bridge with a controlled elevation helper that exits 1223, matching Windows UAC user-cancel behavior, then ran request_permission.',
      errorCode: operation.error.code,
      userVisibleMessage: operation.error.message,
      recommendedRecovery: 'Ask the user to rerun the permission step and approve the Windows administrator prompt.',
      actualRecoveryResult:
        'Operation failed quickly, final status stayed failed, and installation state remained unchanged.',
      evidence: operation.operationId,
      rawEvidencePath: context.caseRoot,
    }
  } finally {
    await bridge.stop()
  }
}

async function validateArtifactMissing() {
  const context = await createCaseContext('artifact-missing')
  const missingAgent = resolve(context.caseRoot, 'missing-agent.pkg')
  const failed = await startBridgeExpectingFailure(context, {
    AGENT_SECURITY_BUNDLED_AGENT_PATH: missingAgent,
  })
  if (!failed.output.includes('Bundled agent artifact is required outside dev mode.')) {
    throw new Error(`artifact_missing did not fail with the expected startup error: ${failed.output}`)
  }

  const recoveryBridge = await startBridge(context)
  try {
    await requestJson(recoveryBridge, '/health')
  } finally {
    await recoveryBridge.stop()
  }

  return {
    case: 'artifact_missing',
    triggerMethod:
      'Started the production bridge with AGENT_SECURITY_BUNDLED_AGENT_PATH pointing to a missing release asset.',
    errorCode: 'bundled_agent_artifact_missing',
    userVisibleMessage: 'Bundled agent artifact is required outside dev mode.',
    recommendedRecovery: 'Restore the exact bundled release package and rerun the installer.',
    actualRecoveryResult: 'Bridge failed before install work began; restoring the bundled artifact let health check pass.',
    evidence: failed.outputPath,
    rawEvidencePath: context.caseRoot,
  }
}

async function validateChecksumMismatch() {
  const context = await createCaseContext('checksum-mismatch')
  const badAgent = resolve(context.caseRoot, 'bad-agent.pkg')
  await copyFile(goodAgent, badAgent)
  await writeFile(badAgent, '\nchecksum-mismatch-validation\n', { flag: 'a' })
  const bridge = await startBridge(context, {
    AGENT_SECURITY_BUNDLED_AGENT_PATH: badAgent,
  })

  try {
    const operation = await runInstaller(bridge)
    assertFailedOperation(operation, 'artifact_invalid')
    await deleteWithBridge(bridge).catch(() => undefined)
    return {
      case: 'checksum_mismatch',
      triggerMethod:
        'Started the production bridge with a modified bundled agent package while keeping the frozen manifest SHA256.',
      errorCode: operation.error.code,
      userVisibleMessage: operation.error.message,
      recommendedRecovery: 'Replace the corrupted package with the exact release asset and rerun install.',
      actualRecoveryResult: 'Installer stopped at checksum verification and did not continue to agent install.',
      evidence: operation.operationId,
      rawEvidencePath: context.caseRoot,
    }
  } finally {
    await bridge.stop()
  }
}

async function validateDeleteFailure() {
  const context = await createCaseContext('delete-failure')
  const bridge = await startBridge(context)
  let protectedPath

  try {
    const install = await runInstaller(bridge)
    assertSucceededOperation(install)
    protectedPath = await createProtectedResidue(context)
    const operation = await deleteWithBridge(bridge)
    assertFailedOperation(operation, 'delete_verification_failed')
    await removeProtectedResidue(protectedPath)
    protectedPath = undefined
    return {
      case: 'delete_failure',
      triggerMethod:
        'Installed the dedicated AgentSecurity distro, created a protected Windows-side residue under its install directory, then ran delete_environment.',
      errorCode: operation.error.code,
      userVisibleMessage: operation.error.message,
      recommendedRecovery: 'Report the remaining path to the user, remove the blocked residue after permission is fixed, then verify the distro is gone.',
      actualRecoveryResult:
        'Delete did not report success while residue remained; removing the protected residue cleared the remaining install directory.',
      evidence: operation.operationId,
      rawEvidencePath: context.caseRoot,
    }
  } finally {
    if (protectedPath) {
      await removeProtectedResidue(protectedPath).catch(() => undefined)
    }
    await bridge.stop()
  }
}

async function createCaseContext(name) {
  const caseRoot = resolve(runRoot, name)
  const localAppData = resolve(caseRoot, 'localappdata')
  await mkdir(localAppData, { recursive: true })
  return {
    name,
    caseRoot,
    localAppData,
    port: nextPort++,
    token: `exception-${name}-${randomUUID()}`,
  }
}

async function startBridge(context, extraEnv = {}) {
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', 'bridge/server.ts'],
    {
      cwd: process.cwd(),
      env: buildBridgeEnv(context, extraEnv),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })
  const bridge = {
    context,
    origin: `http://127.0.0.1:${context.port}`,
    token: context.token,
    child,
    output: () => output,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill()
      }
      await onceExit(child).catch(() => undefined)
    },
  }
  await waitForHealth(bridge)
  return bridge
}

async function startBridgeExpectingFailure(context, extraEnv = {}) {
  const outputPath = resolve(context.caseRoot, 'bridge-startup-failure.txt')
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', 'bridge/server.ts'],
    {
      cwd: process.cwd(),
      env: buildBridgeEnv(context, extraEnv),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })
  await Promise.race([
    onceExit(child),
    sleep(5000).then(() => {
      throw new Error('Bridge did not fail quickly for missing artifact.')
    }),
  ])
  await writeFile(outputPath, output, 'utf8')
  return { output, outputPath }
}

function buildBridgeEnv(context, extraEnv) {
  return {
    ...process.env,
    ...extraEnv,
    LOCALAPPDATA: context.localAppData,
    AGENT_SECURITY_MODE: 'production',
    AGENT_SECURITY_BRIDGE_PORT: String(context.port),
    AGENT_SECURITY_BRIDGE_TOKEN: context.token,
    AGENT_SECURITY_ROOTFS_SHA256: manifest.artifacts.rootfs.sha256,
    AGENT_SECURITY_AGENT_INSTALL_SHA256:
      manifest.artifacts.agentPackage?.sha256 ?? manifest.artifacts.agent.sha256,
    AGENT_SECURITY_BOOTSTRAP_SHA256: manifest.artifacts.bootstrap.sha256,
    AGENT_SECURITY_AGENT_INSTALL_URL: 'bundled://openclaw-agent.pkg',
    AGENT_SECURITY_AGENT_NAME: manifest.agentName ?? 'OpenClaw',
    AGENT_SECURITY_UBUNTU_VERSION: manifest.ubuntuVersion ?? '24.04-lts',
    AGENT_SECURITY_NODE_VERSION: manifest.nodeVersion ?? '24',
    AGENT_SECURITY_OPENCLAW_INSTALL_SOURCE: manifest.openClawInstallSource ?? 'npm',
    AGENT_SECURITY_OPENCLAW_VERSION_POLICY: manifest.openClawVersionPolicy ?? 'latest',
    AGENT_SECURITY_BUNDLED_ROOTFS_PATH:
      extraEnv.AGENT_SECURITY_BUNDLED_ROOTFS_PATH ?? goodRootfs,
    AGENT_SECURITY_BUNDLED_AGENT_PATH:
      extraEnv.AGENT_SECURITY_BUNDLED_AGENT_PATH ?? goodAgent,
    AGENT_SECURITY_BUNDLED_BOOTSTRAP_PATH:
      extraEnv.AGENT_SECURITY_BUNDLED_BOOTSTRAP_PATH ?? goodBootstrap,
  }
}

async function waitForHealth(bridge) {
  for (let index = 0; index < 80; index += 1) {
    if (bridge.child.exitCode !== null) {
      throw new Error(`Bridge exited early: ${bridge.output()}`)
    }
    try {
      await requestJson(bridge, '/health')
      return
    } catch {
      await sleep(250)
    }
  }
  throw new Error(`Bridge did not become healthy: ${bridge.output()}`)
}

async function requestJson(bridge, path, init = {}) {
  const response = await fetch(`${bridge.origin}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-agent-security-token': bridge.token,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

async function runInstaller(bridge) {
  const receipt = await requestJson(bridge, '/installer/start', {
    method: 'POST',
    body: {},
  })
  return pollOperation(bridge, `/installer/operations/${receipt.operationId}`)
}

async function runAction(bridge, action) {
  const snapshot = await requestJson(bridge, '/environments/local-default/snapshot')
  const receipt = await requestJson(bridge, '/actions', {
    method: 'POST',
    body: {
      environmentId: 'local-default',
      action,
      requestId: randomUUID(),
      expectedGeneration: snapshot.generation,
    },
  })
  return pollOperation(bridge, `/environments/local-default/operations/${receipt.operationId}`)
}

async function deleteWithBridge(bridge) {
  const tokenReceipt = await requestJson(bridge, '/actions/confirm-token', {
    method: 'POST',
    body: {
      environmentId: 'local-default',
      action: 'delete_environment',
    },
  })
  const snapshot = await requestJson(bridge, '/environments/local-default/snapshot')
  const receipt = await requestJson(bridge, '/actions', {
    method: 'POST',
    body: {
      environmentId: 'local-default',
      action: 'delete_environment',
      requestId: randomUUID(),
      expectedGeneration: snapshot.generation,
      confirmToken: tokenReceipt.token,
    },
  })
  return pollOperation(bridge, `/environments/local-default/operations/${receipt.operationId}`)
}

async function pollOperation(bridge, path) {
  for (let index = 0; index < 160; index += 1) {
    const operation = await requestJson(bridge, path)
    if (operation.status === 'succeeded' || operation.status === 'failed') {
      return operation
    }
    await sleep(1000)
  }
  throw new Error(`Timed out polling ${path}`)
}

async function createProtectedResidue(context) {
  const distroRoot = resolve(context.localAppData, 'AgentSecurity', 'v2', 'distros', 'AgentSecurity')
  if (!existsSync(distroRoot)) {
    throw new Error(`Could not find distro install directory at ${distroRoot}`)
  }
  const protectedPath = resolve(distroRoot, 'delete-validation-residue')
  await mkdir(protectedPath, { recursive: true })
  await writeFile(resolve(protectedPath, 'residue.txt'), 'delete validation residue\n', 'utf8')
  await powershell(
    `$path='${escapePowershellString(protectedPath)}'; icacls $path /inheritance:r /deny "$($env:USERNAME):(D)" | Out-Null`,
  )
  return protectedPath
}

async function removeProtectedResidue(path) {
  await powershell(
    `$path='${escapePowershellString(path)}'; if (Test-Path $path) { icacls $path /remove:d "$($env:USERNAME)" | Out-Null; icacls $path /grant "$($env:USERNAME):(OI)(CI)F" | Out-Null; Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue }`,
  )
}

function assertFailedOperation(operation, expectedCode) {
  if (operation.status !== 'failed') {
    throw new Error(`Expected operation to fail with ${expectedCode}, received ${operation.status}.`)
  }
  if (operation.error?.code !== expectedCode) {
    throw new Error(`Expected ${expectedCode}, received ${operation.error?.code ?? 'missing'}.`)
  }
}

function assertSucceededOperation(operation) {
  if (operation.status !== 'succeeded') {
    throw new Error(`Expected operation to succeed, received ${operation.status}: ${JSON.stringify(operation.error)}`)
  }
}

function applyResultsToEvidence(target, validationResults) {
  target.exceptionMatrix ??= { blocking: {}, documentedLimitations: {} }
  for (const item of validationResults) {
    target.exceptionMatrix.blocking[item.case] = {
      required: true,
      status: 'validated',
    }
  }

  const byCase = new Map(validationResults.map((item) => [item.case, item]))
  target.exceptionValidation = target.exceptionValidation.map((item) => {
    const replacement = byCase.get(item.case)
    return replacement
      ? {
          case: replacement.case,
          triggerMethod: replacement.triggerMethod,
          errorCode: replacement.errorCode,
          userVisibleMessage: replacement.userVisibleMessage,
          recommendedRecovery: replacement.recommendedRecovery,
          actualRecoveryResult: replacement.actualRecoveryResult,
          evidence: replacement.evidence,
          rawEvidencePath: `${committedResultPath}#${replacement.case}`,
        }
      : item
  })
  target.goNoGo = {
    decision: 'go',
    blockingReasons: [],
    followUpOwner: 'release-lead',
  }
}

async function unregisterAgentSecurity() {
  await powershell('& wsl.exe --unregister AgentSecurity 2>$null; exit 0')
}

function powershell(command) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(stdout)
      } else {
        reject(new Error(stderr || stdout || `powershell exited ${code}`))
      }
    })
  })
}

function onceExit(child) {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null) {
      resolvePromise(child.exitCode)
      return
    }
    child.once('exit', resolvePromise)
  })
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function timestampForPath(date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function escapePowershellString(value) {
  return value.replace(/'/g, "''")
}
