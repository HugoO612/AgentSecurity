import { spawn } from 'node:child_process'

const token = process.env.AGENT_SECURITY_BRIDGE_TOKEN ?? 'agent-security-dev-token'
const port = process.env.AGENT_SECURITY_BRIDGE_PORT ?? '4319'

const bridge = spawn(
  'node',
  ['--watch', '--experimental-strip-types', 'bridge/server.ts'],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      AGENT_SECURITY_BRIDGE_TOKEN: token,
      AGENT_SECURITY_BRIDGE_PORT: port,
    },
  },
)

const app = spawn('npm', ['run', 'dev:app'], {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    AGENT_SECURITY_BRIDGE_TOKEN: token,
    AGENT_SECURITY_BRIDGE_PORT: port,
  },
})

for (const child of [bridge, app]) {
  child.on('exit', () => {
    bridge.kill()
    app.kill()
  })
}
