import { contextBridge } from 'electron'
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
