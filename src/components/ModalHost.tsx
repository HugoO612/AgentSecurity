import { useState } from 'react'
import { copy } from '../copy'
import { ConfirmModal } from './ConfirmModal'
import { useEnvironment } from '../domain/machine'
import { useUiState } from '../ui/ui-store'

export function ModalHost() {
  const { activeModal, setActiveModal } = useUiState()
  const { snapshot, requestPermission, runAction, requestConfirmToken } = useEnvironment()
  const [acknowledged, setAcknowledged] = useState(false)
  const recovery = snapshot.recovery

  const renderImpactSections = (impactKey: Parameters<typeof copy>[0], safeKey: Parameters<typeof copy>[0]) => (
    <>
      <p className="eyebrow">{copy('COPY_LABEL_WILL_AFFECT')}</p>
      <p>{copy(impactKey)}</p>
      <p className="eyebrow">{copy('COPY_LABEL_WILL_NOT_AFFECT')}</p>
      <p>{copy(safeKey)}</p>
      <p className="eyebrow">预计耗时</p>
      <p>
        {activeModal === 'rebuild_confirm'
          ? recovery?.estimatedDuration.rebuild ?? '5-10 分钟'
          : activeModal === 'delete_confirm'
            ? recovery?.estimatedDuration.delete ?? '1-2 分钟'
            : '通常少于 1 分钟'}
      </p>
      {activeModal === 'rebuild_confirm' || activeModal === 'delete_confirm' ? (
        <>
          <p className="eyebrow">不可逆提示</p>
          <p>确认后会立即执行高影响动作，当前隔离环境内容可能无法恢复。</p>
        </>
      ) : null}
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
          void requestConfirmToken('rebuild_environment').then((token) => {
            runAction('rebuild_environment', token)
          })
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
        void requestConfirmToken('delete_environment').then((token) => {
          runAction('delete_environment', token)
        })
      }}
    />
  )
}
