import { copy } from '../copy'
import { scenarioTemplates } from '../domain/mock-data'
import { useUiState } from '../ui/ui-store'

export function DebugDrawer({
  open,
  onApplyScenario,
}: {
  open: boolean
  onApplyScenario: (id: string) => void
}) {
  const { selectedScenarioId, setSelectedScenarioId } = useUiState()

  return (
    <aside className={`debug-drawer ${open ? 'debug-drawer--open' : ''}`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{copy('COPY_LABEL_DEVTOOLS')}</p>
          <h3>{copy('COPY_DEBUG_SCENARIO_TITLE')}</h3>
        </div>
      </div>
      <div className="stack-sm">
        {scenarioTemplates.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={`scenario-button ${selectedScenarioId === scenario.id ? 'scenario-button--active' : ''}`}
            onClick={() => {
              setSelectedScenarioId(scenario.id)
              onApplyScenario(scenario.id)
            }}
          >
            <span>{copy(scenario.labelKey)}</span>
            <small>{scenario.covers.route}</small>
          </button>
        ))}
      </div>
    </aside>
  )
}
