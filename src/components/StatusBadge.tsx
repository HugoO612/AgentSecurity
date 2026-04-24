import type { PropsWithChildren } from 'react'
import type { StatusTone } from '../domain/types'

export function StatusBadge({
  tone,
  children,
}: PropsWithChildren<{ tone: StatusTone }>) {
  return (
    <span className={`status-badge status-badge--${tone}`}>{children}</span>
  )
}
