import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BridgeMode } from '../src/contracts/environment.ts'

export const BRIDGE_SCHEMA_VERSION = 3
export const BRIDGE_VERSION = '2.0.0'
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
  targetDistro: string
  distroSeedName: string
  reportDir: string
  distroInstallRoot: string
  elevationHelperCommand: string
  allowDevShim: boolean
  rebootResumeMarkerPath: string
  hostWriteAllowlist: string[]
  installerDownloadUrl: string
  installerChecksum: string
  bundledRootfsChecksum: string
  bundledRootfsPath: string
  bundledAgentArtifactPath: string
  bundledAgentName: string
  ubuntuVersion: string
  nodeVersion: string
  openClawInstallSource: 'npm'
  openClawVersionPolicy: 'latest'
  openClawPackageName: string
  bundledBootstrapPath: string
  bundledBootstrapChecksum: string
  bundledNodeTarballPath: string
  bundledNodeTarballChecksum: string
  bundledOpenClawTarballPath: string
  bundledOpenClawTarballChecksum: string
}

export function createBridgeConfig(): BridgeConfig {
  const dataRoot = join(getLocalAppDataRoot(), 'AgentSecurity', 'v2')
  const bridgeRoot = dirname(fileURLToPath(import.meta.url))
  const port = Number(process.env.AGENT_SECURITY_BRIDGE_PORT ?? '4319')
  const mode = resolveBridgeMode()
  const bridgeOrigin = `http://127.0.0.1:${port}`
  const tokenFromEnv = process.env.AGENT_SECURITY_BRIDGE_TOKEN?.trim()

  if (mode !== 'dev' && !tokenFromEnv) {
    throw new Error('AGENT_SECURITY_BRIDGE_TOKEN is required outside dev mode.')
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

  const runtimeDir = join(dataRoot, 'runtime')
  const diagnosticsDir = join(dataRoot, 'diagnostics')
  const reportDir = join(dataRoot, 'reports')
  const distroInstallRoot = join(dataRoot, 'distros')
  const bundledRootfsPath =
    process.env.AGENT_SECURITY_BUNDLED_ROOTFS_PATH?.trim() ||
    join(bridgeRoot, 'assets', 'agent-security-rootfs.tar')
  const bundledAgentArtifactPath =
    process.env.AGENT_SECURITY_BUNDLED_AGENT_PATH?.trim() ||
    join(bridgeRoot, 'assets', 'openclaw-agent.pkg')
  const allowDevShim = process.env.AGENT_SECURITY_ALLOW_DEV_SHIM === '1'
  const configuredTargetDistro =
    process.env.AGENT_SECURITY_TARGET_DISTRO?.trim() || 'AgentSecurity'
  const configuredDistroSeed =
    process.env.AGENT_SECURITY_DISTRO_SEED?.trim() || 'AgentSecurityBase'
  const installerDownloadUrl =
    process.env.AGENT_SECURITY_AGENT_INSTALL_URL?.trim() ||
    'bundled://openclaw-agent.pkg'
  const installerChecksum =
    process.env.AGENT_SECURITY_AGENT_INSTALL_SHA256?.trim() ||
    'dev-skip-checksum'
  const bundledRootfsChecksum =
    process.env.AGENT_SECURITY_ROOTFS_SHA256?.trim() || 'dev-skip-checksum'
  const bundledAgentName =
    process.env.AGENT_SECURITY_AGENT_NAME?.trim() || 'OpenClaw'
  const ubuntuVersion =
    process.env.AGENT_SECURITY_UBUNTU_VERSION?.trim() || '24.04-lts'
  const nodeVersion =
    process.env.AGENT_SECURITY_NODE_VERSION?.trim() || '24'
  const openClawPackageName =
    process.env.AGENT_SECURITY_OPENCLAW_PACKAGE?.trim() || 'openclaw'
  const bundledBootstrapPath =
    process.env.AGENT_SECURITY_BUNDLED_BOOTSTRAP_PATH?.trim() ||
    join(bridgeRoot, 'assets', 'openclaw-bootstrap.sh')
  const bundledBootstrapChecksum =
    process.env.AGENT_SECURITY_BOOTSTRAP_SHA256?.trim() || 'dev-skip-checksum'
  const bundledNodeTarballPath =
    process.env.AGENT_SECURITY_BUNDLED_NODE_TARBALL_PATH?.trim() ||
    join(bridgeRoot, 'assets', 'node-v24.15.0-linux-x64.tar.xz')
  const bundledNodeTarballChecksum =
    process.env.AGENT_SECURITY_NODE_TARBALL_SHA256?.trim() || 'dev-skip-checksum'
  const bundledOpenClawTarballPath =
    process.env.AGENT_SECURITY_BUNDLED_OPENCLAW_TARBALL_PATH?.trim() ||
    join(bridgeRoot, 'assets', 'openclaw-2026.4.26.tgz')
  const bundledOpenClawTarballChecksum =
    process.env.AGENT_SECURITY_OPENCLAW_TARBALL_SHA256?.trim() || 'dev-skip-checksum'

  if (mode !== 'dev') {
    if (allowDevShim) {
      throw new Error('AGENT_SECURITY_ALLOW_DEV_SHIM must be disabled outside dev mode.')
    }
    if (configuredTargetDistro !== 'AgentSecurity') {
      throw new Error('Release modes only support the dedicated AgentSecurity distro.')
    }
    if (configuredDistroSeed !== 'AgentSecurityBase') {
      throw new Error('Release modes only support the bundled AgentSecurityBase seed.')
    }
    if (installerDownloadUrl !== 'bundled://openclaw-agent.pkg') {
      throw new Error('Release modes only support bundled installer assets.')
    }
    if (!existsSync(bundledRootfsPath)) {
      throw new Error('Bundled rootfs artifact is required outside dev mode.')
    }
    if (!existsSync(bundledAgentArtifactPath)) {
      throw new Error('Bundled agent artifact is required outside dev mode.')
    }
    if (!existsSync(bundledBootstrapPath)) {
      throw new Error('Bundled OpenClaw bootstrap artifact is required outside dev mode.')
    }
    if (!existsSync(bundledNodeTarballPath)) {
      throw new Error('Bundled Node runtime tarball is required outside dev mode.')
    }
    if (!existsSync(bundledOpenClawTarballPath)) {
      throw new Error('Bundled OpenClaw npm tarball is required outside dev mode.')
    }
    if (!isSha256(installerChecksum)) {
      throw new Error('A real bundled agent artifact SHA256 is required outside dev mode.')
    }
    if (!isSha256(bundledRootfsChecksum)) {
      throw new Error('A real bundled rootfs SHA256 is required outside dev mode.')
    }
    if (!isSha256(bundledBootstrapChecksum)) {
      throw new Error('A real bundled OpenClaw bootstrap SHA256 is required outside dev mode.')
    }
    if (!isSha256(bundledNodeTarballChecksum)) {
      throw new Error('A real bundled Node runtime SHA256 is required outside dev mode.')
    }
    if (!isSha256(bundledOpenClawTarballChecksum)) {
      throw new Error('A real bundled OpenClaw npm tarball SHA256 is required outside dev mode.')
    }
    if (ubuntuVersion !== '24.04-lts') {
      throw new Error('Release modes only support Ubuntu 24.04 LTS rootfs.')
    }
    if (nodeVersion !== '24') {
      throw new Error('Release modes only support Node 24 for OpenClaw.')
    }
  }

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
    runtimeDir,
    diagnosticsDir,
    targetDistro: configuredTargetDistro,
    distroSeedName: configuredDistroSeed,
    reportDir,
    distroInstallRoot,
    elevationHelperCommand:
      process.env.AGENT_SECURITY_ELEVATION_HELPER?.trim() || '',
    allowDevShim,
    rebootResumeMarkerPath: join(runtimeDir, 'resume-after-reboot.json'),
    hostWriteAllowlist: [
      dataRoot,
      runtimeDir,
      diagnosticsDir,
      reportDir,
      distroInstallRoot,
    ],
    installerDownloadUrl:
      installerDownloadUrl,
    installerChecksum,
    bundledRootfsChecksum,
    bundledRootfsPath,
    bundledAgentArtifactPath,
    bundledAgentName,
    ubuntuVersion,
    nodeVersion,
    openClawInstallSource: 'npm',
    openClawVersionPolicy: 'latest',
    openClawPackageName,
    bundledBootstrapPath,
    bundledBootstrapChecksum,
    bundledNodeTarballPath,
    bundledNodeTarballChecksum,
    bundledOpenClawTarballPath,
    bundledOpenClawTarballChecksum,
  }
}

function getLocalAppDataRoot() {
  return process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
}

function resolveBridgeMode(): BridgeMode {
  if (process.env.AGENT_SECURITY_MODE === 'production') {
    return 'production'
  }
  if (process.env.AGENT_SECURITY_MODE === 'preview') {
    return 'preview'
  }
  return 'dev'
}

function isSha256(value: string) {
  return /^[0-9a-f]{64}$/i.test(value)
}
