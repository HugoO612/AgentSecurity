import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let cleanupDir = ''
let serverModule: Awaited<typeof import('../../bridge/server.ts')>

describe('bridge server', () => {
  beforeAll(async () => {
    cleanupDir = await mkdtemp(join(tmpdir(), 'agent-security-bridge-'))
    process.env.LOCALAPPDATA = cleanupDir
    process.env.AGENT_SECURITY_BRIDGE_PORT = '4321'
    process.env.AGENT_SECURITY_BRIDGE_TOKEN = 'test-token'
    process.env.AGENT_SECURITY_ALLOWED_ORIGINS = 'http://localhost:5173'
    serverModule = await import('../../bridge/server.ts')
    await serverModule.start()
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      serverModule.server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
    await rm(cleanupDir, { recursive: true, force: true })
  })

  it('exposes health and a persisted initial snapshot', async () => {
    const headers = {
      'x-agent-security-token': 'test-token',
    }

    const healthResponse = await fetch('http://127.0.0.1:4321/health', {
      headers,
    })
    expect(healthResponse.ok).toBe(true)

    const snapshotResponse = await fetch(
      'http://127.0.0.1:4321/environments/local-default/snapshot',
      { headers },
    )
    const snapshot = await snapshotResponse.json()

    expect(snapshot.environmentId).toBe('local-default')
    expect(snapshot.generation).toBe(0)
    expect(snapshot.installation.state).toBe('not-installed')

    const stateFile = await readFile(
      join(cleanupDir, 'AgentSecurity', 'v1', 'state', 'environment-state.json'),
      'utf8',
    )
    expect(stateFile).toContain('"schemaVersion": 2')
  })

  it('runs the receipt -> operation -> snapshot flow and rejects concurrent actions', async () => {
    const headers = {
      'x-agent-security-token': 'test-token',
      'content-type': 'application/json',
      Origin: 'http://localhost:5173',
    }

    const precheckReceiptResponse = await fetch(
      'http://127.0.0.1:4321/actions',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          environmentId: 'local-default',
          action: 'run_precheck',
          requestId: 'precheck-test',
          expectedGeneration: 0,
        }),
      },
    )

    const precheckReceipt = await precheckReceiptResponse.json()
    expect(precheckReceipt.accepted).toBe(true)
    expect(precheckReceipt.operationId).toBeTruthy()

    const concurrentReceiptResponse = await fetch(
      'http://127.0.0.1:4321/actions',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          environmentId: 'local-default',
          action: 'run_precheck',
          requestId: 'precheck-concurrent',
          expectedGeneration: 0,
        }),
      },
    )

    expect(concurrentReceiptResponse.status).toBe(409)
    const concurrentReceipt = await concurrentReceiptResponse.json()
    expect(concurrentReceipt.error.code).toBe('operation_in_progress')

    const runningOperationResponse = await fetch(
      `http://127.0.0.1:4321/environments/local-default/operations/${precheckReceipt.operationId}`,
      { headers: { 'x-agent-security-token': 'test-token' } },
    )
    const runningOperation = await runningOperationResponse.json()
    expect(runningOperation.status).toBe('running')

    const finalOperationResponse = await fetch(
      `http://127.0.0.1:4321/environments/local-default/operations/${precheckReceipt.operationId}`,
      { headers: { 'x-agent-security-token': 'test-token' } },
    )
    const finalOperation = await finalOperationResponse.json()
    expect(['succeeded', 'failed']).toContain(finalOperation.status)

    const refreshedSnapshotResponse = await fetch(
      'http://127.0.0.1:4321/environments/local-default/snapshot',
      { headers: { 'x-agent-security-token': 'test-token' } },
    )
    const refreshedSnapshot = await refreshedSnapshotResponse.json()
    expect(['precheck-required', 'ready-to-install']).toContain(
      refreshedSnapshot.installation.state,
    )
    expect(refreshedSnapshot.activeOperation).toBeUndefined()
  })

  it('maps auth and origin failures to connection failure classes', async () => {
    const unauthorized = await fetch('http://127.0.0.1:4321/health', {
      headers: {
        'x-agent-security-token': 'wrong-token',
      },
    })
    const unauthorizedBody = await unauthorized.json()
    expect(unauthorized.status).toBe(401)
    expect(unauthorizedBody.error.kind).toBe('bridge_untrusted')

    const forbidden = await fetch('http://127.0.0.1:4321/health', {
      headers: {
        'x-agent-security-token': 'test-token',
        Origin: 'http://evil.example',
      },
    })
    const forbiddenBody = await forbidden.json()
    expect(forbidden.status).toBe(403)
    expect(forbiddenBody.error.kind).toBe('bridge_forbidden')
  })

  it('exposes diagnostics summary without sensitive data', async () => {
    const response = await fetch(
      'http://127.0.0.1:4321/environments/local-default/diagnostics/summary',
      {
        headers: {
          'x-agent-security-token': 'test-token',
        },
      },
    )
    const diagnostics = await response.json()

    expect(diagnostics.userSummary.conclusion).toBeTruthy()
    expect(diagnostics.supportSummary.bridgeVersion).toBeTruthy()
    expect(JSON.stringify(diagnostics)).not.toContain('test-token')
  })
})
