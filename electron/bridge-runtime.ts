import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { BridgeMode } from '../src/contracts/environment.ts'

type ReleaseAssetManifest = {
  version: string
  sourceCommit?: string
  agentName?: string
  packageFormat?: string
  updatePolicy?: string
  ubuntuVersion?: string
  nodeVersion?: string
  openClawInstallSource?: string
  openClawVersionPolicy?: string
  artifacts?: {
    rootfs?: {
      path: string
      sha256: string
    }
    agentPackage?: {
      path: string
      sha256: string
    }
    agent?: {
      path: string
      sha256: string
    }
    bootstrap?: {
      path: string
      sha256: string
    }
  }
}

export type DesktopPaths = {
  rendererUrl?: string
  rendererHtmlPath?: string
  preloadPath: string
  bridgeEntryPath: string
  manifestPath: string
  rootfsPath: string
  agentPackagePath: string
  bootstrapPath: string
}

export type BridgeAssetContext = {
  manifest: ReleaseAssetManifest
  agentName: string
  agentChecksum: string
  rootfsChecksum: string
  bootstrapChecksum: string
  ubuntuVersion: string
  nodeVersion: string
}

export function resolveDesktopPaths(input: {
  isPackaged: boolean
  appRoot: string
  resourcesPath: string
  rendererDevUrl?: string
}): DesktopPaths {
  return input.isPackaged
    ? {
        rendererHtmlPath: join(input.appRoot, 'dist', 'index.html'),
        preloadPath: join(input.appRoot, 'dist-electron', 'electron', 'preload.cjs'),
        bridgeEntryPath: join(input.resourcesPath, 'bridge', 'bridge', 'server.js'),
        manifestPath: join(input.resourcesPath, 'bridge-assets', 'release-assets-manifest.json'),
        rootfsPath: join(input.resourcesPath, 'bridge-assets', 'agent-security-rootfs.tar'),
        agentPackagePath: join(input.resourcesPath, 'bridge-assets', 'openclaw-agent.pkg'),
        bootstrapPath: join(input.resourcesPath, 'bridge-assets', 'openclaw-bootstrap.sh'),
      }
    : {
        rendererUrl: input.rendererDevUrl ?? 'http://127.0.0.1:5173',
        preloadPath: join(input.appRoot, 'dist-electron', 'electron', 'preload.cjs'),
        bridgeEntryPath: resolve(input.appRoot, 'bridge', 'server.ts'),
        manifestPath: resolve(input.appRoot, 'bridge', 'assets', 'release-assets-manifest.json'),
        rootfsPath: resolve(input.appRoot, 'bridge', 'assets', 'agent-security-rootfs.tar'),
        agentPackagePath: resolve(input.appRoot, 'bridge', 'assets', 'openclaw-agent.pkg'),
        bootstrapPath: resolve(input.appRoot, 'bridge', 'assets', 'openclaw-bootstrap.sh'),
      }
}

export async function readBridgeAssetContext(
  manifestPath: string,
): Promise<BridgeAssetContext> {
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as ReleaseAssetManifest
  const agentArtifact = manifest.artifacts?.agentPackage ?? manifest.artifacts?.agent

  if (!manifest.artifacts?.rootfs?.sha256) {
    throw new Error('Release asset manifest is missing rootfs SHA256.')
  }
  if (!agentArtifact?.sha256) {
    throw new Error('Release asset manifest is missing bundled agent package SHA256.')
  }
  if (!manifest.artifacts?.bootstrap?.sha256) {
    throw new Error('Release asset manifest is missing OpenClaw bootstrap SHA256.')
  }

  return {
    manifest,
    agentName: manifest.agentName ?? 'OpenClaw',
    agentChecksum: agentArtifact.sha256,
    rootfsChecksum: manifest.artifacts.rootfs.sha256,
    bootstrapChecksum: manifest.artifacts.bootstrap.sha256,
    ubuntuVersion: manifest.ubuntuVersion ?? '24.04-lts',
    nodeVersion: manifest.nodeVersion ?? '24',
  }
}

export function buildBridgeEnvironment(input: {
  mode: BridgeMode
  token: string
  port: number
  allowedOrigins: string[]
  paths: Pick<DesktopPaths, 'rootfsPath' | 'agentPackagePath' | 'bootstrapPath'>
  assets: BridgeAssetContext
  baseEnv?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
  return {
    ...input.baseEnv,
    AGENT_SECURITY_MODE: input.mode,
    AGENT_SECURITY_BRIDGE_PORT: String(input.port),
    AGENT_SECURITY_BRIDGE_TOKEN: input.token,
    AGENT_SECURITY_ALLOWED_ORIGINS: input.allowedOrigins.join(','),
    AGENT_SECURITY_BUNDLED_ROOTFS_PATH: input.paths.rootfsPath,
    AGENT_SECURITY_BUNDLED_AGENT_PATH: input.paths.agentPackagePath,
    AGENT_SECURITY_BUNDLED_BOOTSTRAP_PATH: input.paths.bootstrapPath,
    AGENT_SECURITY_AGENT_INSTALL_URL: 'bundled://openclaw-agent.pkg',
    AGENT_SECURITY_ROOTFS_SHA256: input.assets.rootfsChecksum,
    AGENT_SECURITY_AGENT_INSTALL_SHA256: input.assets.agentChecksum,
    AGENT_SECURITY_BOOTSTRAP_SHA256: input.assets.bootstrapChecksum,
    AGENT_SECURITY_AGENT_NAME: input.assets.agentName,
    AGENT_SECURITY_UBUNTU_VERSION: input.assets.ubuntuVersion,
    AGENT_SECURITY_NODE_VERSION: input.assets.nodeVersion,
    AGENT_SECURITY_OPENCLAW_INSTALL_SOURCE: 'npm',
    AGENT_SECURITY_OPENCLAW_VERSION_POLICY: 'latest',
  }
}

export async function findAvailablePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a local bridge port.')))
        return
      }
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolvePort(address.port)
      })
    })
  })
}
