import { describe, expect, it } from 'vitest'
import {
  createDesktopBootstrap,
  decodeDesktopBootstrapArg,
  encodeDesktopBootstrapArg,
  resolveDesktopAppOrigin,
} from '../../electron/desktop-bootstrap.ts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildBridgeEnvironment,
  readBridgeAssetContext,
} from '../../electron/bridge-runtime.ts'

describe('desktop bootstrap helpers', () => {
  it('round-trips desktop bootstrap through the Electron additional argument', () => {
    const bootstrap = createDesktopBootstrap({
      mode: 'production',
      sessionToken: 'desktop-token',
      bridgePort: 4319,
    })

    const arg = encodeDesktopBootstrapArg(bootstrap)
    expect(decodeDesktopBootstrapArg(['electron.exe', arg])).toEqual(bootstrap)
  })

  it('normalizes missing desktop origin to null', () => {
    expect(resolveDesktopAppOrigin(undefined)).toBe('null')
    expect(resolveDesktopAppOrigin('null')).toBe('null')
  })

  it('builds production bridge env with OpenClaw release-facing values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-security-desktop-'))
    try {
      const manifestPath = join(root, 'release-assets-manifest.json')
      await writeFile(
        manifestPath,
        JSON.stringify({
          version: '2026.04.28-rc1',
          sourceCommit: 'abc123',
          agentName: 'OpenClaw',
          ubuntuVersion: '24.04-lts',
          nodeVersion: '24',
          openClawInstallSource: 'npm',
          openClawVersionPolicy: 'latest',
          artifacts: {
            rootfs: {
              path: 'bridge/assets/agent-security-rootfs.tar',
              sha256: 'a'.repeat(64),
            },
            agentPackage: {
              path: 'bridge/assets/openclaw-agent.pkg',
              sha256: 'b'.repeat(64),
            },
            bootstrap: {
              path: 'bridge/assets/openclaw-bootstrap.sh',
              sha256: 'c'.repeat(64),
            },
          },
        }),
        'utf8',
      )

      const assets = await readBridgeAssetContext(manifestPath)
      const env = buildBridgeEnvironment({
        mode: 'production',
        token: 'desktop-token',
        port: 4319,
        allowedOrigins: ['null'],
        paths: {
          rootfsPath: 'C:\\assets\\agent-security-rootfs.tar',
          agentPackagePath: 'C:\\assets\\openclaw-agent.pkg',
          bootstrapPath: 'C:\\assets\\openclaw-bootstrap.sh',
        },
        assets,
      })

      expect(env.AGENT_SECURITY_AGENT_INSTALL_URL).toBe('bundled://openclaw-agent.pkg')
      expect(env.AGENT_SECURITY_AGENT_NAME).toBe('OpenClaw')
      expect(env.AGENT_SECURITY_BUNDLED_BOOTSTRAP_PATH).toBe('C:\\assets\\openclaw-bootstrap.sh')
      expect(env.AGENT_SECURITY_BOOTSTRAP_SHA256).toBe('c'.repeat(64))
      expect(env.AGENT_SECURITY_UBUNTU_VERSION).toBe('24.04-lts')
      expect(env.AGENT_SECURITY_NODE_VERSION).toBe('24')
      expect(env.AGENT_SECURITY_ALLOWED_ORIGINS).toBe('null')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
