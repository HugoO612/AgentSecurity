import { copy } from '../../copy'
import { PageScaffold } from '../../components/PageScaffold'
import { ProgressSteps } from '../../components/ProgressSteps'
import { useEnvironment } from '../../domain/machine'

export function InstallingPage() {
  const { snapshot } = useEnvironment()
  const stage = snapshot.activeOperation?.stage ?? 'collecting_facts'
  const activeStep = resolveStepFromStage(stage)
  const waitingPermission = stage === 'awaiting_permission'
  const waitingReboot = stage === 'awaiting_reboot'

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
          <p>{resolveStageLabel(stage)}</p>
          {waitingPermission ? <p>{copy('COPY_HINT_PERMISSION_PROMPT')}</p> : null}
          {waitingReboot ? <p>需要重启后继续安装流程。</p> : null}
        </article>
        <ProgressSteps activeStep={activeStep} />
      </div>
    </PageScaffold>
  )
}

function resolveStepFromStage(stage: string) {
  if (['collecting_facts', 'enabling_features', 'awaiting_permission', 'awaiting_reboot'].includes(stage)) {
    return 0
  }
  if (['preparing_distro'].includes(stage)) {
    return 1
  }
  if (['installing_agent', 'writing_config'].includes(stage)) {
    return 2
  }
  if (['starting_bridge', 'verifying_install', 'completed'].includes(stage)) {
    return 3
  }
  return 0
}

function resolveStageLabel(stage: string) {
  const labels: Record<string, string> = {
    collecting_facts: '正在检查设备条件',
    enabling_features: '正在启用必要系统能力',
    awaiting_permission: '等待权限确认',
    awaiting_reboot: '等待重启恢复',
    preparing_distro: '正在准备专用隔离环境',
    installing_agent: '正在安装 agent',
    writing_config: '正在写入运行配置',
    starting_bridge: '正在启动运行组件',
    verifying_install: '正在做首次健康检查',
    completed: '安装阶段已完成',
  }
  return labels[stage] ?? '正在执行安装步骤'
}
