import type {
  BoundarySelfCheckReport,
  BridgeMode,
  DeleteResultReport,
  EnvironmentReport,
  EnvironmentSnapshot,
  SupportBundleExport,
} from '../src/contracts/environment.ts'

type ReportContext = {
  mode: BridgeMode
  bridgeOrigin: string
  runtimeDir: string
  diagnosticsDir: string
  dataDir: string
  targetDistro: string
}

export function buildEnvironmentReport(
  snapshot: EnvironmentSnapshot,
  context: ReportContext,
): EnvironmentReport {
  return {
    generatedAt: new Date().toISOString(),
    runtimeLocation: snapshot.runtime.location === 'wsl2'
      ? '当前运行在 WSL2 专用隔离环境中。'
      : '当前运行位置未知。',
    targetDistro: context.targetDistro,
    bridgeStatus:
      context.mode === 'dev'
        ? `本地 bridge 通过 ${context.bridgeOrigin} 提供受控动作入口；开发模式下应明确区分真实执行与 dev shim。`
        : context.mode === 'preview'
          ? `本地 bridge 通过 ${context.bridgeOrigin} 提供受控动作入口；当前为发布前 preview 模式。`
        : `本地 bridge 通过 ${context.bridgeOrigin} 提供受控动作入口。`,
    windowsHostWritesSummary:
      snapshot.runtime.windowsHostWritesSummary ??
      `Windows 主环境仅写入受控目录：${context.dataDir}、${context.runtimeDir}、${context.diagnosticsDir}。`,
    windowsHostNoWriteSummary:
      '不会直接把 agent 安装到 Windows 主环境的常规程序目录、用户文档目录或任意自选路径。',
    installationLocationSummary:
      snapshot.runtime.installationLocationSummary ??
      `agent 运行文件位于专用隔离 distro ${context.targetDistro} 内部。`,
    isolationBoundarySummary:
      snapshot.runtime.isolationBoundarySummary ??
      '高风险动作只通过本地 bridge 调度，agent 不直接在 Windows 主环境执行。',
    currentPermissionSummary:
      snapshot.failure?.stage === 'permission'
        ? '当前流程正在等待必要权限。'
        : '当前未检测到持续权限阻塞。',
    currentLogLocationSummary: `日志与诊断信息位于 ${context.diagnosticsDir}。`,
    currentRuntimeDirectorySummary: `运行时目录位于 ${context.runtimeDir}。`,
  }
}

export function buildBoundarySelfCheckReport(
  snapshot: EnvironmentSnapshot,
  context: ReportContext,
): BoundarySelfCheckReport {
  const agentRunsInsideWindowsHost = snapshot.runtime.location !== 'wsl2'
  const bridgeControlsHighRiskActions = snapshot.runtime.bridgeControlledActionsOnly !== false
  return {
    generatedAt: new Date().toISOString(),
    agentRunsInsideWindowsHost,
    bridgeControlsHighRiskActions,
    currentPermissionState:
      snapshot.failure?.stage === 'permission' ? 'awaiting_permission' : 'normal',
    bridgeControlStatus:
      snapshot.security?.bridgeControlStatus ??
      `高风险动作统一通过 ${context.bridgeOrigin} 上的受控 bridge 入口处理。`,
    hostImpactConfirmed: snapshot.runtime.hostImpactConfirmed !== false,
    summary: agentRunsInsideWindowsHost
      ? '需要排查：当前无法确认 agent 仍在隔离环境内运行。'
      : '边界自检通过：agent 未直接运行在 Windows 主环境，且高风险动作由 bridge 统一控制。',
  }
}

export function buildDeleteResultReport(
  snapshot: EnvironmentSnapshot,
): DeleteResultReport {
  return {
    generatedAt: new Date().toISOString(),
    deletedItems: snapshot.deleteSummary?.deletedItems ?? [],
    remainingItems: snapshot.deleteSummary?.remainingItems ?? [],
    windowsHostResidualSummary:
      snapshot.deleteSummary?.windowsHostResidualSummary ??
      '未生成删除结果摘要。',
    summary:
      snapshot.installation.state === 'not-installed'
        ? '隔离环境已删除，保留项已明确列出。'
        : '删除尚未完成或未执行。',
  }
}

export function buildSupportBundleExport(
  snapshot: EnvironmentSnapshot,
  context: ReportContext,
): SupportBundleExport {
  const environmentReport =
    snapshot.report?.environment ?? buildEnvironmentReport(snapshot, context)
  const boundarySelfCheck =
    snapshot.report?.boundary ?? buildBoundarySelfCheckReport(snapshot, context)
  const deleteResult =
    snapshot.report?.deleteResult ??
    (snapshot.deleteSummary ? buildDeleteResultReport(snapshot) : undefined)
  return {
    exportedAt: new Date().toISOString(),
    environmentReport: sanitizeEnvironmentReport(environmentReport, context),
    boundarySelfCheck: sanitizeBoundaryReport(boundarySelfCheck, context),
    ...(deleteResult
      ? { deleteResult: sanitizeDeleteResultReport(deleteResult, context) }
      : {}),
    diagnostics: sanitizeDiagnostics(snapshot, context),
  }
}

function sanitizeEnvironmentReport(
  report: EnvironmentReport,
  context: ReportContext,
): EnvironmentReport {
  return {
    ...report,
    windowsHostWritesSummary: redactPaths(report.windowsHostWritesSummary, context),
    currentLogLocationSummary: redactPaths(report.currentLogLocationSummary, context),
    currentRuntimeDirectorySummary: redactPaths(
      report.currentRuntimeDirectorySummary,
      context,
    ),
  }
}

function sanitizeBoundaryReport(
  report: BoundarySelfCheckReport,
  context: ReportContext,
): BoundarySelfCheckReport {
  return {
    ...report,
    bridgeControlStatus: redactPaths(report.bridgeControlStatus, context),
    summary: redactPaths(report.summary, context),
  }
}

function sanitizeDeleteResultReport(
  report: DeleteResultReport,
  context: ReportContext,
): DeleteResultReport {
  return {
    ...report,
    deletedItems: report.deletedItems.map((item) => redactPaths(item, context)),
    remainingItems: report.remainingItems.map((item) => redactPaths(item, context)),
    windowsHostResidualSummary: redactPaths(
      report.windowsHostResidualSummary,
      context,
    ),
    summary: redactPaths(report.summary, context),
  }
}

function sanitizeDiagnostics(
  snapshot: EnvironmentSnapshot,
  context: ReportContext,
) {
  return {
    ...snapshot.diagnostics,
    supportSummary: {
      ...snapshot.diagnostics.supportSummary,
      recentCommands: snapshot.diagnostics.supportSummary.recentCommands?.map((audit) => ({
        ...audit,
        stdoutPreview: audit.stdoutPreview
          ? redactPaths(audit.stdoutPreview, context)
          : audit.stdoutPreview,
        stderrPreview: audit.stderrPreview
          ? redactPaths(audit.stderrPreview, context)
          : audit.stderrPreview,
      })),
    },
  }
}

function redactPaths(value: string, context: ReportContext) {
  return [
    [context.dataDir, '[CONTROLLED_DATA_DIR]'],
    [context.runtimeDir, '[CONTROLLED_RUNTIME_DIR]'],
    [context.diagnosticsDir, '[CONTROLLED_DIAGNOSTICS_DIR]'],
  ].reduce((text, [pattern, replacement]) => text.split(pattern).join(replacement), value)
}
