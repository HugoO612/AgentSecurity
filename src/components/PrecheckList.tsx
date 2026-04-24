import { copy } from '../copy'
import type { CheckSummary, PrecheckItem } from '../domain/types'

const resultLabels = {
  passed: '通过',
  warning: '需留意',
  blocked: '阻塞',
  checking: '检查中',
  unknown: '未知',
} as const

const copyMap = {
  windows_version: {
    titleKey: 'COPY_CHECK_SYSTEM_VERSION_TITLE',
    messageKey: 'COPY_CHECK_SYSTEM_VERSION_DESC',
  },
  wsl_status: {
    titleKey: 'COPY_CHECK_ISOLATION_CAPABILITY_TITLE',
    messageKey: 'COPY_CHECK_ISOLATION_CAPABILITY_DESC',
  },
  virtualization: {
    titleKey: 'COPY_CHECK_VIRTUALIZATION_TITLE',
    messageKey: 'COPY_CHECK_VIRTUALIZATION_DESC',
  },
  disk_space: {
    titleKey: 'COPY_CHECK_DISK_SPACE_TITLE',
    messageKey: 'COPY_CHECK_DISK_SPACE_DESC',
  },
  network: {
    titleKey: 'COPY_CHECK_NETWORK_TITLE',
    messageKey: 'COPY_CHECK_NETWORK_DESC',
  },
  permission: {
    titleKey: 'COPY_CHECK_PERMISSION_READY_TITLE',
    messageKey: 'COPY_CHECK_PERMISSION_READY_DESC',
  },
  distro: {
    titleKey: 'COPY_CHECK_ISOLATION_CAPABILITY_TITLE',
    messageKey: 'COPY_CHECK_ISOLATION_CAPABILITY_DESC',
  },
  unknown: {
    titleKey: 'COPY_CHECK_SYSTEM_VERSION_TITLE',
    messageKey: 'COPY_CHECK_SYSTEM_VERSION_DESC',
  },
} as const

export function PrecheckList({
  checks,
  summary,
}: {
  checks: PrecheckItem[]
  summary: CheckSummary
}) {
  return (
    <div className="stack-lg">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{copy('COPY_LABEL_CHECK_RESULTS')}</p>
          <h3>预检明细</h3>
        </div>
        <div className="precheck-summary">
          <span>通过 {summary.passCount}</span>
          <span>警告 {summary.warnCount}</span>
          <span>阻塞 {summary.blockCount}</span>
        </div>
      </div>
      <div className="precheck-list">
        {checks.map((item) => (
          <article className="precheck-item" key={`${item.code}-${item.updatedAt}`}>
            <div>
              <h4>{copy(copyMap[item.code].titleKey)}</h4>
              <p>{item.message || copy(copyMap[item.code].messageKey)}</p>
              {item.detail ? <small>{item.detail}</small> : null}
            </div>
            <span className={`chip chip--${item.status}`}>
              {resultLabels[item.status]}
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}
