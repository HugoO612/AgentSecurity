import { contextBridge, ipcRenderer } from 'electron'
import {
  decodeDesktopBootstrapArg,
  resolveDesktopAppOrigin,
} from './desktop-bootstrap.js'

const bootstrap = decodeDesktopBootstrapArg(process.argv)

if (bootstrap) {
  contextBridge.exposeInMainWorld('__AGENT_SECURITY_BOOTSTRAP__', Object.freeze({
    ...bootstrap,
    appOrigin: resolveDesktopAppOrigin(globalThis.location?.origin),
  }))
}

contextBridge.exposeInMainWorld('__AGENT_SECURITY_DESKTOP__', Object.freeze({
  openExternal(url: string) {
    return ipcRenderer.invoke('agent-security:open-external', url)
  },
}))
