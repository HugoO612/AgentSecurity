import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BridgeMode } from '../src/contracts/environment.ts'

export const BRIDGE_SCHEMA_VERSION = 2
export const BRIDGE_VERSION = '1.0.0'
export const DEFAULT_ENVIRONMENT_ID = 'local-default'

export type BridgeConfig = {
  mode: BridgeMode
  port: number
  token: string
  bridgeOrigin: string
  allowedHosts: Set<string>
  allowedOrigins: Set<string>
  dataRoot: string
  stateFile: string
  operationsDir: string
  runtimeDir: string
  diagnosticsDir: string
}

export function createBridgeConfig(): BridgeConfig {
  const dataRoot = join(getLocalAppDataRoot(), 'AgentSecurity', 'v1')
  const port = Number(process.env.AGENT_SECURITY_BRIDGE_PORT ?? '4319')
  const mode = resolveBridgeMode()
  const bridgeOrigin = `http://127.0.0.1:${port}`
  const tokenFromEnv = process.env.AGENT_SECURITY_BRIDGE_TOKEN?.trim()

  if (mode === 'production' && !tokenFromEnv) {
    throw new Error('AGENT_SECURITY_BRIDGE_TOKEN is required in production mode.')
  }

  const token = tokenFromEnv || 'agent-security-dev-token'
  const defaultOrigins =
    mode === 'dev'
      ? [
          `http://127.0.0.1:${port}`,
          `http://localhost:${port}`,
          'http://127.0.0.1:5173',
          'http://localhost:5173',
          'http://127.0.0.1:4173',
          'http://localhost:4173',
        ]
      : []
  const allowedOrigins = new Set(
    (process.env.AGENT_SECURITY_ALLOWED_ORIGINS
      ? process.env.AGENT_SECURITY_ALLOWED_ORIGINS.split(',')
      : defaultOrigins
    )
      .map((entry) => entry.trim())
      .filter(Boolean),
  )

  return {
    mode,
    port,
    token,
    bridgeOrigin,
    allowedHosts: new Set([`127.0.0.1:${port}`, `localhost:${port}`]),
    allowedOrigins,
    dataRoot,
    stateFile: join(dataRoot, 'state', 'environment-state.json'),
    operationsDir: join(dataRoot, 'operations'),
    runtimeDir: join(dataRoot, 'runtime'),
    diagnosticsDir: join(dataRoot, 'diagnostics'),
  }
}

function getLocalAppDataRoot() {
  return process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
}

function resolveBridgeMode(): BridgeMode {
  return process.env.AGENT_SECURITY_MODE === 'production' ? 'production' : 'dev'
}
