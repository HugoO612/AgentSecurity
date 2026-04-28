import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

afterEach(async () => {
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV }
})

describe('bridge config', () => {
  it('allows dev mode defaults for local development', async () => {
    process.env.AGENT_SECURITY_MODE = 'dev'
    delete process.env.AGENT_SECURITY_ALLOW_DEV_SHIM
    delete process.env.AGENT_SECURITY_TARGET_DISTRO

    const { createBridgeConfig } = await import('../../bridge/config.ts')
    const config = createBridgeConfig()

    expect(config.mode).toBe('dev')
    expect(config.targetDistro).toBe('AgentSecurity')
    expect(config.installerDownloadUrl).toBe('bundled://agent-security-agent.pkg')
  })

  it('rejects production mode when dev shim is enabled', async () => {
    process.env.AGENT_SECURITY_MODE = 'production'
    process.env.AGENT_SECURITY_BRIDGE_TOKEN = 'token'
    process.env.AGENT_SECURITY_ALLOW_DEV_SHIM = '1'

    const { createBridgeConfig } = await import('../../bridge/config.ts')
    expect(() => createBridgeConfig()).toThrow(
      'AGENT_SECURITY_ALLOW_DEV_SHIM must be disabled outside dev mode.',
    )
  })

  it('rejects production mode when target distro is overridden', async () => {
    process.env.AGENT_SECURITY_MODE = 'production'
    process.env.AGENT_SECURITY_BRIDGE_TOKEN = 'token'
    process.env.AGENT_SECURITY_TARGET_DISTRO = 'Ubuntu'

    const { createBridgeConfig } = await import('../../bridge/config.ts')
    expect(() => createBridgeConfig()).toThrow(
      'Release modes only support the dedicated AgentSecurity distro.',
    )
  })

  it('rejects production mode when installer source is not bundled', async () => {
    process.env.AGENT_SECURITY_MODE = 'production'
    process.env.AGENT_SECURITY_BRIDGE_TOKEN = 'token'
    process.env.AGENT_SECURITY_AGENT_INSTALL_URL = 'https://example.com/install.sh'

    const { createBridgeConfig } = await import('../../bridge/config.ts')
    expect(() => createBridgeConfig()).toThrow(
      'Release modes only support bundled installer assets.',
    )
  })

  it('applies the same hardening rules in preview mode', async () => {
    process.env.AGENT_SECURITY_MODE = 'preview'
    process.env.AGENT_SECURITY_BRIDGE_TOKEN = 'token'
    process.env.AGENT_SECURITY_ALLOW_DEV_SHIM = '1'

    const { createBridgeConfig } = await import('../../bridge/config.ts')
    expect(() => createBridgeConfig()).toThrow(
      'AGENT_SECURITY_ALLOW_DEV_SHIM must be disabled outside dev mode.',
    )
  })

  it('accepts production mode only with bundled assets and a real checksum', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-security-config-'))
    const rootfs = join(root, 'agent-security-rootfs.tar')
    const agent = join(root, 'agent-security-agent.pkg')
    await writeFile(rootfs, 'rootfs', 'utf8')
    await writeFile(agent, 'agent', 'utf8')

    process.env.AGENT_SECURITY_MODE = 'production'
    process.env.AGENT_SECURITY_BRIDGE_TOKEN = 'token'
    process.env.AGENT_SECURITY_BUNDLED_ROOTFS_PATH = rootfs
    process.env.AGENT_SECURITY_BUNDLED_AGENT_PATH = agent
    process.env.AGENT_SECURITY_ROOTFS_SHA256 =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    process.env.AGENT_SECURITY_AGENT_INSTALL_SHA256 =
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'

    const { createBridgeConfig } = await import('../../bridge/config.ts')
    const config = createBridgeConfig()

    expect(config.mode).toBe('production')
    expect(config.allowDevShim).toBe(false)
    expect(config.targetDistro).toBe('AgentSecurity')
    expect(config.bundledRootfsChecksum).toBe(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    )

    await rm(root, { recursive: true, force: true })
  })
})
