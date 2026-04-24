import { useNavigate } from 'react-router-dom'
import { copy } from '../../copy'
import { PageScaffold } from '../../components/PageScaffold'
import { StatusBadge } from '../../components/StatusBadge'

export function EntryPage() {
  const navigate = useNavigate()

  return (
    <PageScaffold
      titleKey="COPY_TITLE_ENTRY"
      descriptionKey="COPY_DESC_ENTRY"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_INSTALL_PATH')}</p>
          <div className="stack-sm">
            <div className="promise-card">
              <h3>{copy('COPY_PROMISE_ISOLATED')}</h3>
              <p>{copy('COPY_HINT_SAFE_SCOPE')}</p>
            </div>
            <div className="promise-card">
              <h3>{copy('COPY_PROMISE_RECOVERABLE')}</h3>
              <p>{copy('COPY_DESC_RECOVERY')}</p>
            </div>
          </div>
        </div>
      }
    >
      <div className="card-grid">
        <article className="option-card option-card--recommended">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy('COPY_LABEL_RUNTIME_LOCATION')}</p>
              <h3>{copy('COPY_ENTRY_LOCAL_TITLE')}</h3>
            </div>
            <StatusBadge tone="positive">
              {copy('COPY_LABEL_RECOMMENDED')}
            </StatusBadge>
          </div>
          <p>{copy('COPY_DESC_SCOPE')}</p>
          <ul className="info-list">
            <li>{copy('COPY_ENTRY_LOCAL_ITEM_1')}</li>
            <li>{copy('COPY_ENTRY_LOCAL_ITEM_2')}</li>
            <li>{copy('COPY_ENTRY_LOCAL_ITEM_3')}</li>
          </ul>
          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => navigate('/preinstall')}
            >
              {copy('COPY_BTN_CHOOSE_LOCAL')}
            </button>
          </div>
        </article>
      </div>
    </PageScaffold>
  )
}
