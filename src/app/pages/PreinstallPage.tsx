import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { copy } from '../../copy'
import { PageScaffold } from '../../components/PageScaffold'
import { useEnvironment } from '../../domain/machine'

export function PreinstallPage() {
  const navigate = useNavigate()
  const { beginPrecheck } = useEnvironment()
  const [checkedScope, setCheckedScope] = useState(false)
  const [checkedRecovery, setCheckedRecovery] = useState(false)
  const canContinue = checkedScope && checkedRecovery

  return (
    <PageScaffold
      titleKey="COPY_TITLE_PREINSTALL"
      descriptionKey="COPY_DESC_SCOPE"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">{copy('COPY_LABEL_INSTALL_PATH')}</p>
          <div className="stack-sm">
            <div className="promise-card">
              <h3>{copy('COPY_PREINSTALL_PERMISSION_TITLE')}</h3>
              <p>{copy('COPY_DESC_PERMISSION')}</p>
            </div>
            <div className="promise-card">
              <h3>{copy('COPY_PREINSTALL_RECOVERY_TITLE')}</h3>
              <p>{copy('COPY_DESC_STORAGE')}</p>
            </div>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <article className="content-card">
          <p>{copy('COPY_DESC_SCOPE')}</p>
          <p>{copy('COPY_DESC_PERMISSION')}</p>
          <p>{copy('COPY_DESC_STORAGE')}</p>
        </article>
        <div className="stack-sm">
          <label className="checkbox-row">
            <input
              checked={checkedScope}
              type="checkbox"
              onChange={(event) => setCheckedScope(event.currentTarget.checked)}
            />
            <span>{copy('COPY_PREINSTALL_CHECK_SCOPE')}</span>
          </label>
          <label className="checkbox-row">
            <input
              checked={checkedRecovery}
              type="checkbox"
              onChange={(event) => setCheckedRecovery(event.currentTarget.checked)}
            />
            <span>{copy('COPY_PREINSTALL_CHECK_RECOVERY')}</span>
          </label>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() => navigate('/')}
          >
            {copy('COPY_BTN_CANCEL')}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!canContinue}
            onClick={() => {
              beginPrecheck()
              navigate('/precheck')
            }}
          >
            {copy('COPY_BTN_CONTINUE')}
          </button>
        </div>
      </div>
    </PageScaffold>
  )
}
