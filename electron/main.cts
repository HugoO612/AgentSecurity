import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import {
  buildBridgeEnvironment,
  findAvailablePort,
  readBridgeAssetContext,
  resolveDesktopPaths,
} from './bridge-runtime.js'
import {
  createDesktopBootstrap,
  encodeDesktopBootstrapArg,
} from './desktop-bootstrap.js'

const appRoot = join(__dirname, '..', '..')
const bridgeStdoutReadyPattern = /Agent Security bridge listening on/i

let mainWindow: BrowserWindow | null = null
let bridgeChild: ChildProcess | null = null

void startDesktopApp()

async function startDesktopApp() {
  await app.whenReady()
  registerDesktopIpcHandlers()
  const bridgePort = await findAvailablePort()
  const bridgeToken = randomUUID()
  const desktopPaths = resolveDesktopPaths({
    isPackaged: app.isPackaged,
    appRoot,
    resourcesPath: (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? appRoot,
    rendererDevUrl: process.env.ELECTRON_RENDERER_URL,
  })
  const assets = await readBridgeAssetContext(desktopPaths.manifestPath)
  const mode = app.isPackaged ? 'production' : 'dev'
  const allowedOrigins = app.isPackaged
    ? ['null']
    : [new URL(desktopPaths.rendererUrl ?? 'http://127.0.0.1:5173').origin]

  bridgeChild = spawnBridgeProcess({
    bridgeEntryPath: desktopPaths.bridgeEntryPath,
    isPackaged: app.isPackaged,
    port: bridgePort,
    token: bridgeToken,
    allowedOrigins,
    rootfsPath: desktopPaths.rootfsPath,
    agentPackagePath: desktopPaths.agentPackagePath,
    bootstrapPath: desktopPaths.bootstrapPath,
    assets,
    mode,
  })

  await waitForBridgeReady(bridgeChild)

  mainWindow = createMainWindow({
    isPackaged: app.isPackaged,
    rendererUrl: desktopPaths.rendererUrl,
    rendererHtmlPath: desktopPaths.rendererHtmlPath,
    preloadPath: desktopPaths.preloadPath,
    bootstrapArg: encodeDesktopBootstrapArg(
      createDesktopBootstrap({
        mode,
        sessionToken: bridgeToken,
        bridgePort,
        allowMockFallback: mode === 'dev',
      }),
    ),
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 || !mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow({
        isPackaged: app.isPackaged,
        rendererUrl: desktopPaths.rendererUrl,
        rendererHtmlPath: desktopPaths.rendererHtmlPath,
        preloadPath: desktopPaths.preloadPath,
        bootstrapArg: encodeDesktopBootstrapArg(
          createDesktopBootstrap({
            mode,
            sessionToken: bridgeToken,
            bridgePort,
            allowMockFallback: mode === 'dev',
          }),
        ),
      })
    }
  })
}

function registerDesktopIpcHandlers() {
  ipcMain.handle('agent-security:open-external', async (_event: unknown, url: unknown) => {
    if (typeof url !== 'string' || !isAllowedOpenClawUrl(url)) {
      throw new Error('Only local OpenClaw onboarding URLs can be opened.')
    }

    await shell.openExternal(url)
    return { ok: true }
  })
}

function isAllowedOpenClawUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    const hostname = url.hostname.toLowerCase()
    return (
      url.protocol === 'http:' &&
      (hostname === '127.0.0.1' || hostname === 'localhost') &&
      Number.isInteger(Number(url.port)) &&
      Number(url.port) > 0 &&
      Number(url.port) <= 65535 &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

function createMainWindow(input: {
  isPackaged: boolean
  rendererUrl?: string
  rendererHtmlPath?: string
  preloadPath: string
  bootstrapArg: string
}) {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 720,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0f1720',
    webPreferences: {
      preload: input.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [input.bootstrapArg],
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.once('ready-to-show', () => {
    window.show()
  })

  if (input.isPackaged) {
    if (!input.rendererHtmlPath) {
      throw new Error('Missing packaged renderer entry.')
    }
    void window.loadFile(input.rendererHtmlPath)
  } else {
    void window.loadURL(input.rendererUrl ?? 'http://127.0.0.1:5173')
    window.webContents.openDevTools({ mode: 'detach' })
  }

  return window
}

function spawnBridgeProcess(input: {
  bridgeEntryPath: string
  isPackaged: boolean
  port: number
  token: string
  allowedOrigins: string[]
  rootfsPath: string
  agentPackagePath: string
  bootstrapPath: string
  assets: Awaited<ReturnType<typeof readBridgeAssetContext>>
  mode: 'dev' | 'production'
}) {
  const env = buildBridgeEnvironment({
    mode: input.mode,
    token: input.token,
    port: input.port,
    allowedOrigins: input.allowedOrigins,
    paths: {
      rootfsPath: input.rootfsPath,
      agentPackagePath: input.agentPackagePath,
      bootstrapPath: input.bootstrapPath,
    },
    assets: input.assets,
    baseEnv: process.env,
  })

  if (input.isPackaged) {
    return spawn(process.execPath, [input.bridgeEntryPath], {
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  return spawn('node', ['--experimental-strip-types', input.bridgeEntryPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function waitForBridgeReady(child: ChildProcess | null) {
  if (!child || !child.stdout || !child.stderr) {
    throw new Error('Bridge child process did not start correctly.')
  }
  const stdout = child.stdout
  const stderr = child.stderr

  return new Promise<void>((resolveReady, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      resolveReady()
    }, 5000)

    stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      process.stdout.write(text)
      if (!settled && bridgeStdoutReadyPattern.test(text)) {
        settled = true
        clearTimeout(timeout)
        resolveReady()
      }
    })

    stderr.on('data', (chunk) => {
      process.stderr.write(chunk.toString('utf8'))
    })

    child.once('exit', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      reject(new Error(`Bridge exited before desktop startup completed (code ${code ?? 'unknown'}).`))
    })
  })
}

async function stopBridgeChild() {
  if (!bridgeChild || bridgeChild.killed) {
    return
  }

  await new Promise<void>((resolveStop) => {
    const activeChild = bridgeChild
    if (!activeChild) {
      resolveStop()
      return
    }

    const timeout = setTimeout(() => {
      if (!activeChild.killed) {
        activeChild.kill('SIGKILL')
      }
      resolveStop()
    }, 3000)

    activeChild.once('exit', () => {
      clearTimeout(timeout)
      resolveStop()
    })
    activeChild.kill()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void stopBridgeChild()
})
