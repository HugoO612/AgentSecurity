import { zhCN } from './zhCN'

const bannedTerms = ['WSL2', 'Linux 子系统', 'kernel', '挂载', '容器']
let warned = false

export function warnOnBannedTerms() {
  if (!import.meta.env.DEV || warned) {
    return
  }

  const offenders = Object.entries(zhCN).filter(([, value]) =>
    bannedTerms.some((term) => value.includes(term)),
  )

  if (offenders.length > 0) {
    warned = true
    console.warn(
      'Detected banned user-facing terms:',
      offenders.map(([key]) => key),
    )
  }
}
