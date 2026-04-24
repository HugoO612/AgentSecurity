import { useEffect, useState } from 'react'
import { copy } from '../../copy'
import { PageScaffold } from '../../components/PageScaffold'
import { ProgressSteps } from '../../components/ProgressSteps'
import { useEnvironment } from '../../domain/machine'

export function InstallingPage() {
  const { snapshot } = useEnvironment()
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStep((current) => (current < 3 ? current + 1 : current))
    }, 650)

    return () => window.clearInterval(timer)
  }, [snapshot.updatedAt])

  return (
    <PageScaffold
      titleKey="COPY_TITLE_INSTALLING"
      descriptionKey="COPY_DESC_INSTALLING"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_STATUS_SUMMARY')}</p>
          <div className="promise-card">
            <h3>{copy('COPY_HINT_PERMISSION_PROMPT')}</h3>
            <p>{copy('COPY_DESC_SCOPE')}</p>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <article className="content-card content-card--emphasis">
          <h3>{copy('COPY_INSTALLING_PROGRESS_TITLE')}</h3>
          <p>{copy('COPY_HINT_SAFE_SCOPE')}</p>
        </article>
        <ProgressSteps activeStep={activeStep} />
      </div>
    </PageScaffold>
  )
}
