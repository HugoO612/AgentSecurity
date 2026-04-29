declare module 'electron' {
  export type App = {
    isPackaged: boolean
    whenReady(): Promise<void>
    on(event: string, listener: (...args: unknown[]) => void): App
    quit(): void
  }

  export type BrowserWindowConstructorOptions = {
    width?: number
    height?: number
    minWidth?: number
    minHeight?: number
    autoHideMenuBar?: boolean
    show?: boolean
    backgroundColor?: string
    webPreferences?: {
      preload?: string
      contextIsolation?: boolean
      nodeIntegration?: boolean
      sandbox?: boolean
      additionalArguments?: string[]
    }
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions)
    loadFile(path: string): Promise<void>
    loadURL(url: string): Promise<void>
    once(event: string, listener: () => void): this
    show(): void
    isDestroyed(): boolean
    webContents: {
      setWindowOpenHandler(handler: () => { action: 'allow' | 'deny' }): void
      openDevTools(options?: { mode?: string }): void
    }
    static getAllWindows(): BrowserWindow[]
  }

  export const app: App
  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: unknown): void
  }
}
