import { copy } from '../copy'

const steps = [
  'COPY_STEP_CHECK',
  'COPY_STEP_CREATE',
  'COPY_STEP_CONFIGURE',
  'COPY_STEP_VERIFY',
] as const

export function ProgressSteps({ activeStep }: { activeStep: number }) {
  return (
    <div className="progress-steps">
      {steps.map((step, index) => {
        const status =
          index < activeStep ? 'done' : index === activeStep ? 'active' : 'idle'

        return (
          <div className={`progress-step progress-step--${status}`} key={step}>
            <span className="progress-step-index">{index + 1}</span>
            <div>
              <p className="eyebrow">{copy('COPY_LABEL_STEP_CURRENT')}</p>
              <strong>{copy(step)}</strong>
            </div>
          </div>
        )
      })}
    </div>
  )
}
