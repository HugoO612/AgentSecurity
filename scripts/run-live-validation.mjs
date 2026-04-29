import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const manifestPath = resolve('bridge/assets/release-assets-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const port = Number(process.env.AGENT_SECURITY_BRIDGE_PORT || 4399)
const token = process.env.AGENT_SECURITY_BRIDGE_TOKEN || `live-validation-${randomUUID()}`
const origin = `http://127.0.0.1:${port}`
const evidencePath =
  process.argv[2] ?? `docs/release-evidence-${new Date().toISOString().slice(0, 10)}.json`

const rootfsSha256 = manifest.artifacts.rootfs.sha256
const agentArtifact = manifest.artifacts.agentPackage ?? manifest.artifacts.agent
const agentSha256 = agentArtifact.sha256
const installerPath = 'release/AgentSecurity Setup.exe'
const installerShaPath = `${installerPath}.sha256`
const installerSha256 = await readInstallerSha256(installerShaPath).catch(() => undefined)
const commit = await git(['rev-parse', '--short', 'HEAD']).catch(() => 'unknown')
const machine = await host(['$env:COMPUTERNAME']).catch(() => 'unknown')
const lifecycle = []

const server = spawn(
  process.execPath,
  ['--experimental-strip-types', 'bridge/server.ts'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENT_SECURITY_MODE: 'production',
      AGENT_SECURITY_BRIDGE_PORT: String(port),
      AGENT_SECURITY_BRIDGE_TOKEN: token,
      AGENT_SECURITY_ROOTFS_SHA256: rootfsSha256,
      AGENT_SECURITY_AGENT_INSTALL_SHA256: agentSha256,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let serverOutput = ''
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString()
})
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString()
})

try {
  await waitForHealth()
  await recordPrecheck()
  await runLifecycleStep('install', 'installer', '/installer/start', '/installer/operations')
  await runLifecycleStep('stop_agent', 'stop_agent', '/actions', '/environments/local-default/operations')
  await runLifecycleStep('start_agent', 'start_agent', '/actions', '/environments/local-default/operations')
  await runLifecycleStep(
    'rebuild_environment',
    'rebuild_environment',
    '/actions',
    '/environments/local-default/operations',
    true,
  )
  await runLifecycleStep(
    'delete_environment',
    'delete_environment',
    '/actions',
    '/environments/local-default/operations',
    true,
  )

  const supportBundle = await requestJson('/diagnostics/export')
  const supportText = JSON.stringify(supportBundle)
  const distroList = await command('wsl.exe', ['-l', '-q']).catch(() => '')
  const distroPresentAfterDelete = parseDistroList(distroList).includes('AgentSecurity')

  const evidence = {
    candidateVersion: manifest.version,
    commit,
    runAt: new Date().toISOString(),
    machine,
    mode: 'release-candidate-validation',
    executionMode: 'live',
    targetDistro: 'AgentSecurity',
    bundledArtifacts: {
      rootfs: manifest.artifacts.rootfs.path,
      agent: agentArtifact.path,
      checksums: {
        rootfsSha256,
        agentSha256,
      },
      version: manifest.version,
      source: manifest.source,
      updatePolicy: manifest.updatePolicy,
    },
    releaseArtifacts: installerSha256
      ? {
          windowsInstaller: {
            path: installerPath,
            sha256: installerSha256,
            signatureStatus: 'Unsigned',
            signaturePolicy: 'unsigned-accepted',
            userVisibleInstallNote:
              'Windows may show an unknown publisher warning. Verify the SHA256 file from the GitHub Release before installing.',
          },
          windowsInstallerSha256File: installerShaPath,
        }
      : undefined,
    exceptionMatrix: {
      blocking: {
        permission_denied: { required: true, status: 'pending' },
        artifact_missing: { required: true, status: 'pending' },
        checksum_mismatch: { required: true, status: 'pending' },
        delete_failure: { required: true, status: 'pending' },
      },
      documentedLimitations: {
        wsl_disabled: {
          required: false,
          status: 'documented',
          documentationReference: 'docs/exception-matrix-validation.md#wsl_disabled',
          recoverySummary: 'Prompt the user to enable WSL2, then rerun precheck and install.',
        },
        reboot_interrupted: {
          required: false,
          status: 'documented',
          documentationReference: 'docs/exception-matrix-validation.md#reboot_interrupted',
          recoverySummary: 'Reopen the installer after reboot and follow the guided resume or reinstall path.',
        },
        startup_failure: {
          required: false,
          status: 'documented',
          documentationReference: 'docs/exception-matrix-validation.md#startup_failure',
          recoverySummary: 'Use retry, rebuild, or delete and reinstall based on the recovery guidance.',
        },
      },
    },
    shimmedCommands: [],
    lifecycle,
    exceptionValidation: buildUnvalidatedExceptionMatrix(),
    residualItems: {
      remainingWindowsPaths: extractArray(supportBundle.deleteResult?.remainingItems),
      removedWindowsPaths: extractArray(supportBundle.deleteResult?.deletedItems),
      distroPresentAfterDelete,
      logsRetainedForSupport: extractArray(supportBundle.deleteResult?.remainingItems),
      unexpectedResidue: distroPresentAfterDelete ? ['AgentSecurity distro still present'] : [],
    },
    supportBundleChecks: {
      containsBridgeToken: supportText.includes(token),
      containsLocalAppDataPath: /AppData\\\\Local|AppData\\Local|LOCALAPPDATA/i.test(supportText),
      containsAuthorizationHeader: /authorization\s*[:=]/i.test(supportText),
      containsRedactedMarkers: supportText.includes('[CONTROLLED_') || supportText.includes('[REDACTED'),
    },
    goNoGo: {
      decision: 'hold',
      blockingReasons: [
        'Exception matrix requires destructive or privileged machine-state cases that were not validated by this runner.',
      ],
      followUpOwner: 'release-lead',
    },
  }

  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  process.stdout.write(`Live validation evidence written to ${evidencePath}\n`)
} finally {
  server.kill()
}

async function recordPrecheck() {
  await runAction('run_precheck', '/actions', '/environments/local-default/operations')
}

async function runLifecycleStep(evidenceAction, action, submitPath, pollBase, confirm = false) {
  const before = await requestJson('/environments/local-default/snapshot')
  const operation = await runAction(action, submitPath, pollBase, confirm)
  const after = await requestJson('/environments/local-default/snapshot')
  lifecycle.push({
    action: evidenceAction === 'install' ? 'install' : evidenceAction,
    beforeState: before.installation?.state ?? 'unknown',
    receiptStatus: 202,
    finalStatus: operation.status === 'succeeded' ? 'succeeded' : 'failed',
    finalStage: operation.stage,
    afterState: after.installation?.state ?? 'unknown',
    recoveryAction: operation.error?.suggestedRecovery ?? null,
    evidence: operation.operationId,
  })
  if (operation.status !== 'succeeded') {
    throw new Error(`${action} failed: ${JSON.stringify(operation.error ?? operation)}`)
  }
}

async function runAction(action, submitPath, pollBase, confirm = false) {
  let confirmToken
  if (confirm) {
    const tokenReceipt = await requestJson('/actions/confirm-token', {
      method: 'POST',
      body: { environmentId: 'local-default', action },
    })
    confirmToken = tokenReceipt.token
  }

  const receipt = await requestJson(submitPath, {
    method: 'POST',
    body:
      submitPath === '/installer/start'
        ? {}
        : {
            environmentId: 'local-default',
            action,
            requestId: randomUUID(),
            confirmToken,
          },
  })

  return pollOperation(`${pollBase}/${receipt.operationId}`)
}

async function pollOperation(path) {
  for (let index = 0; index < 120; index += 1) {
    const operation = await requestJson(path)
    if (operation.status === 'succeeded' || operation.status === 'failed') {
      return operation
    }
    await sleep(1000)
  }
  throw new Error(`Timed out polling ${path}`)
}

async function waitForHealth() {
  for (let index = 0; index < 60; index += 1) {
    try {
      await requestJson('/health')
      return
    } catch {
      if (server.exitCode !== null) {
        throw new Error(`Bridge exited early: ${serverOutput}`)
      }
      await sleep(500)
    }
  }
  throw new Error(`Bridge did not become healthy: ${serverOutput}`)
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-agent-security-token': token,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

function buildUnvalidatedExceptionMatrix() {
  return [
    'permission_denied',
    'wsl_disabled',
    'reboot_interrupted',
    'artifact_missing',
    'checksum_mismatch',
    'startup_failure',
    'delete_failure',
  ].map((name) => ({
    case: name,
    triggerMethod: 'NOT_VALIDATED',
    errorCode: limitationCase(name) ? 'DOCUMENTED_LIMITATION' : 'NOT_VALIDATED',
    userVisibleMessage: 'Not validated in this live lifecycle run.',
    recommendedRecovery: 'Run the dedicated exception validation case on a controlled Windows machine.',
    actualRecoveryResult: limitationCase(name) ? 'documented only' : 'NOT_VALIDATED',
    evidence: limitationCase(name) ? 'documentation-only' : 'missing',
    documentationReference: limitationCase(name)
      ? `docs/exception-matrix-validation.md#${name}`
      : undefined,
  }))
}

function limitationCase(name) {
  return (
    name === 'wsl_disabled' ||
    name === 'reboot_interrupted' ||
    name === 'startup_failure'
  )
}

function extractArray(value) {
  return Array.isArray(value) ? value : []
}

function parseDistroList(value) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.replaceAll('\u0000', '').trim())
    .filter(Boolean)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function git(args) {
  return (await command('git', args)).trim()
}

async function host(commands) {
  return (await command('powershell.exe', ['-NoProfile', '-Command', commands.join(';')])).trim()
}

function command(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] })
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
        resolve(stdout)
      } else {
        reject(new Error(stderr || stdout || `${program} exited ${code}`))
      }
    })
  })
}

async function readInstallerSha256(path) {
  const text = await readFile(path, 'utf8')
  const match = text.match(/[0-9a-f]{64}/i)
  if (!match) {
    throw new Error(`No SHA256 found in ${path}`)
  }
  return match[0].toLowerCase()
}
