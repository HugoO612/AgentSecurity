import type { BootstrapConfig, BridgeMode } from '../src/contracts/environment.ts'

const BOOTSTRAP_ARG_PREFIX = '--agent-security-bootstrap='

export function createDesktopBootstrap(input: {
  mode: BridgeMode
  sessionToken: string
  bridgePort: number
  appOrigin?: string
  allowMockFallback?: boolean
}): BootstrapConfig {
  return {
    version: 'v1',
    mode: input.mode,
    sessionToken: input.sessionToken,
    bridgeBaseUrl: `http://127.0.0.1:${input.bridgePort}`,
    appOrigin: input.appOrigin ?? 'null',
    allowMockFallback: input.allowMockFallback ?? false,
  }
}

export function encodeDesktopBootstrapArg(bootstrap: BootstrapConfig) {
  const encoded = Buffer.from(JSON.stringify(bootstrap), 'utf8').toString('base64url')
  return `${BOOTSTRAP_ARG_PREFIX}${encoded}`
}

export function decodeDesktopBootstrapArg(
  argv: string[],
): BootstrapConfig | null {
  const encoded = argv.find((value) => value.startsWith(BOOTSTRAP_ARG_PREFIX))
  if (!encoded) {
    return null
  }

  const payload = encoded.slice(BOOTSTRAP_ARG_PREFIX.length)
  const text = Buffer.from(payload, 'base64url').toString('utf8')
  return JSON.parse(text) as BootstrapConfig
}

export function resolveDesktopAppOrigin(origin: string | undefined) {
  if (!origin || origin.trim().length === 0) {
    return 'null'
  }

  return origin
}
