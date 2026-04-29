import { spawn } from 'node:child_process'
import { request } from 'node:http'

const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173'
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

await runCommand(npmBin, ['run', 'build:electron'])

const vite = spawn(npmBin, ['run', 'dev:app', '--', '--host', '127.0.0.1', '--port', '5173'], {
  stdio: 'inherit',
  shell: false,
  env: process.env,
})

const cleanup = () => {
  vite.kill()
}

process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})
process.on('SIGTERM', () => {
  cleanup()
  process.exit(143)
})

await waitForRenderer(rendererUrl)

const electronBin = process.platform === 'win32'
  ? 'node_modules\\.bin\\electron.cmd'
  : 'node_modules/.bin/electron'

const electron = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl,
  },
})

electron.once('exit', (code) => {
  cleanup()
  process.exit(code ?? 0)
})

async function waitForRenderer(url) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 30_000) {
    const ready = await checkUrl(url)
    if (ready) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error(`Timed out waiting for renderer at ${url}.`)
}

async function checkUrl(url) {
  return new Promise((resolve) => {
    const req = request(url, { method: 'GET' }, (response) => {
      response.resume()
      resolve((response.statusCode ?? 500) < 500)
    })
    req.on('error', () => resolve(false))
    req.end()
  })
}

async function runCommand(command, args) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    })
    child.once('error', rejectRun)
    child.once('exit', (code) => {
      if (code === 0) {
        resolveRun(undefined)
        return
      }
      rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`))
    })
  })
}
