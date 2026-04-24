import type { PropsWithChildren, ReactNode } from 'react'
import { copy } from '../copy'
import type { CopyKey } from '../copy/keys'

type PageScaffoldProps = PropsWithChildren<{
  titleKey: CopyKey
  descriptionKey: CopyKey
  sideContent?: ReactNode
}>

export function PageScaffold({
  titleKey,
  descriptionKey,
  sideContent,
  children,
}: PageScaffoldProps) {
  return (
    <section className="page-shell">
      <div className="page-main">
        <header className="page-header">
          <p className="eyebrow">Agent Security v1</p>
          <h2>{copy(titleKey)}</h2>
          <p className="page-description">{copy(descriptionKey)}</p>
        </header>
        {children}
      </div>
      {sideContent ? <aside className="page-side">{sideContent}</aside> : null}
    </section>
  )
}
