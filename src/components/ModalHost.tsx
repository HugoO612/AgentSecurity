import { useState } from 'react'
import { copy } from '../copy'
import { ConfirmModal } from './ConfirmModal'
import { useEnvironment } from '../domain/machine'
import { useUiState } from '../ui/ui-store'

export function ModalHost() {
  const { activeModal, setActiveModal } = useUiState()
  const { requestPermission, runAction } = useEnvironment()
  const [acknowledged, setAcknowledged] = useState(false)

  const renderImpactSections = (impactKey: Parameters<typeof copy>[0], safeKey: Parameters<typeof copy>[0]) => (
    <>
      <p className="eyebrow">{copy('COPY_LABEL_WILL_AFFECT')}</p>
      <p>{copy(impactKey)}</p>
      <p className="eyebrow">{copy('COPY_LABEL_WILL_NOT_AFFECT')}</p>
      <p>{copy(safeKey)}</p>
    </>
  )

  if (!activeModal) {
    return null
  }

  if (activeModal === 'permission_confirm') {
    return (
      <ConfirmModal
        title={copy('COPY_TITLE_CONFIRM_PERMISSION')}
        body={copy('COPY_CONFIRM_PERMISSION_BODY')}
        confirmLabel={copy('COPY_BTN_CONTINUE')}
        cancelLabel={copy('COPY_BTN_CANCEL')}
        note={renderImpactSections(
          'COPY_CONFIRM_PERMISSION_IMPACT',
          'COPY_CONFIRM_PERMISSION_SAFE',
        )}
        onCancel={() => setActiveModal(null)}
        onConfirm={() => {
          setActiveModal(null)
          requestPermission()
        }}
      />
    )
  }

  if (activeModal === 'rebuild_confirm') {
    return (
      <ConfirmModal
        title={copy('COPY_TITLE_CONFIRM_REBUILD')}
        body={copy('COPY_CONFIRM_REBUILD_BODY')}
        confirmLabel={copy('COPY_BTN_CONFIRM_REBUILD')}
        cancelLabel={copy('COPY_BTN_CANCEL')}
        confirmDisabled={!acknowledged}
        note={renderImpactSections(
          'COPY_CONFIRM_REBUILD_IMPACT',
          'COPY_CONFIRM_REBUILD_SAFE',
        )}
        onCancel={() => {
          setAcknowledged(false)
          setActiveModal(null)
        }}
        onConfirm={() => {
          setAcknowledged(false)
          setActiveModal(null)
          runAction('rebuild_environment')
        }}
      >
        <label className="checkbox-row">
          <input
            checked={acknowledged}
            type="checkbox"
            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          />
          <span>{copy('COPY_CONFIRM_REBUILD_CHECK')}</span>
        </label>
      </ConfirmModal>
    )
  }

  return (
    <ConfirmModal
      title={copy('COPY_TITLE_CONFIRM_DELETE')}
      body={copy('COPY_CONFIRM_DELETE_BODY')}
      confirmLabel={copy('COPY_BTN_CONFIRM_DELETE')}
      cancelLabel={copy('COPY_BTN_CANCEL')}
      note={renderImpactSections(
        'COPY_CONFIRM_DELETE_IMPACT',
        'COPY_CONFIRM_DELETE_SAFE',
      )}
      onCancel={() => setActiveModal(null)}
      onConfirm={() => {
        setActiveModal(null)
        runAction('delete_environment')
      }}
    />
  )
}
