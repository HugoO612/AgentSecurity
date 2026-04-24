import type { CopyKey } from './keys'
import { zhCN } from './zhCN'

export function copy(key: CopyKey) {
  return zhCN[key]
}

export { zhCN }
