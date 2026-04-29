import type {
  DiagnosticsSummary,
  EnvironmentSnapshot,
  FailureSnapshot,
} from '../src/contracts/environment.ts'
import {
  BRIDGE_VERSION,
  DEFAULT_ENVIRONMENT_ID,
  type BridgeConfig,
} from './config.ts'
import {
  buildBoundarySelfCheckReport,
  buildDeleteResultReport,
  buildEnvironmentReport,
} from './report-builder.ts'

export function createInitialSnapshot(
  config: BridgeConfig,
  now = new Date().toISOString(),
): EnvironmentSnapshot {
  const snapshot: EnvironmentSnapshot = {
    environmentId: DEFAULT_ENVIRONMENT_ID,
    revision: 1,
    generation: 0,
    updatedAt: now,
    installation: {
      state: 'not-installed',
      installed: false,
    },
    runtime: {
      location: 'wsl2',
      processState: 'stopped',
      distroName: config.targetDistro,
      agentName: config.bundledAgentName,
      agentVersion: '1.0.0',
      ubuntuVersion: config.ubuntuVersion,
      nodeVersion: config.nodeVersion,
      openClawInstallSource: config.openClawInstallSource,
      openClawVersionPolicy: config.openClawVersionPolicy,
      wslAvailable: false,
      distroPresent: false,
      nodeInstalled: false,
      openClawInstalled: false,
      openClawRunning: false,
      onboardingUrl: 'http://127.0.0.1:18789/',
      onboardingCommand: 'open OpenClaw onboarding after install',
      installationLocationSummary: `${config.bundledAgentName} 将安装到专用隔离环境 ${config.targetDistro} 中。`,
      windowsHostWritesSummary: `Windows 主环境只会写入受控目录：${config.dataRoot}、${config.runtimeDir}、${config.diagnosticsDir}。`,
      isolationBoundarySummary: `${config.bundledAgentName} 默认仅在 WSL2 专用隔离环境中运行，不直接跑在 Windows 主环境。`,
      hostImpactConfirmed: true,
      bridgeControlledActionsOnly: true,
      targetDistroKind: 'dedicated',
    },
    checks: [],
    health: {
      status: 'unknown',
      startupFailureCount: 0,
      lastCheckedAt: now,
    },
    capabilities: {
      canRunPrecheck: true,
      canInstall: true,
      canRetry: false,
      canStart: false,
      canStop: false,
      canRestart: false,
      canRebuild: false,
      canDelete: false,
      canRequestPermission: true,
    },
    actionLocks: [],
    commandAudits: [],
    diagnostics: emptyDiagnostics(config),
    deleteSummary: {
      deletedItems: [],
      remainingItems: [],
      windowsHostResidualSummary: `Windows 主环境保留受控数据目录：${config.dataRoot}。`,
    },
    security: {
      boundarySelfCheck: '边界自检尚未执行。',
      bridgeControlStatus: '高风险动作仅能通过 bridge 入口处理。',
    },
    recovery: {
      recommendedAction: undefined,
      availableActions: ['export_support_bundle'],
      estimatedDuration: {},
      dataImpactSummary: {},
      hostImpactSummary: {},
      supportBundleAvailable: true,
      actionDisabledReason: {
        retry: '当前没有可重试的失败。',
        rebuild: '当前尚未创建隔离环境。',
        delete: '当前尚未创建隔离环境。',
      },
    },
    report: {
      environmentReportAvailable: true,
      supportBundleAvailable: true,
    },
  }

  return withDiagnostics(snapshot, config)
}

export function withDiagnostics(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): EnvironmentSnapshot {
  const environmentReport = buildEnvironmentReport(snapshot, {
    mode: config.mode,
    bridgeOrigin: config.bridgeOrigin,
    runtimeDir: config.runtimeDir,
    diagnosticsDir: config.diagnosticsDir,
    dataDir: config.dataRoot,
    targetDistro: config.targetDistro,
  })
  const boundary = buildBoundarySelfCheckReport(snapshot, {
    mode: config.mode,
    bridgeOrigin: config.bridgeOrigin,
    runtimeDir: config.runtimeDir,
    diagnosticsDir: config.diagnosticsDir,
    dataDir: config.dataRoot,
    targetDistro: config.targetDistro,
  })
  const deleteResult = buildDeleteResultReport(snapshot)

  return {
    ...snapshot,
    diagnostics: buildDiagnostics(snapshot, config),
    report: {
      environmentReportAvailable: true,
      supportBundleAvailable: true,
      environment: environmentReport,
      boundary,
      deleteResult,
    },
    security: {
      boundarySelfCheck: boundary.summary,
      bridgeControlStatus: boundary.bridgeControlStatus,
    },
  }
}

export function emptyDiagnostics(config: BridgeConfig): DiagnosticsSummary {
  return {
    userSummary: {
      conclusion: '当前尚未安装正式本地隔离环境。',
      recommendedNextStep: '开始安装以准备本地隔离环境。',
      retryable: true,
    },
    supportSummary: {
      bridgeVersion: BRIDGE_VERSION,
      port: config.port,
      generation: 0,
      runtimeLocation: 'wsl2',
      executionMode: config.allowDevShim ? 'dev-shim' : 'live',
      artifactStatus: buildArtifactStatus(createInitialSnapshotBaseRuntimeVersion(), config, []),
      mode: config.mode,
      isMock: false,
      recentCommands: [],
    },
  }
}

export function buildDiagnostics(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): DiagnosticsSummary {
  return {
    userSummary: {
      conclusion:
        snapshot.failure?.message ??
        (snapshot.installation.state === 'not-installed'
          ? '当前尚未安装正式本地隔离环境。'
          : '当前运行环境状态正常。'),
      recommendedNextStep: describeNextStep(snapshot.failure, snapshot),
      retryable: snapshot.failure?.retryable ?? false,
    },
    supportSummary: {
      bridgeVersion: BRIDGE_VERSION,
      port: config.port,
      generation: snapshot.generation,
      runtimeLocation: snapshot.runtime.location,
      executionMode: config.allowDevShim ? 'dev-shim' : 'live',
      artifactStatus: buildArtifactStatus(
        snapshot.runtime.agentVersion,
        config,
        snapshot.commandAudits ?? [],
      ),
      mode: config.mode,
      isMock: false,
      recentCommands: snapshot.commandAudits?.slice(-10) ?? [],
      ...(snapshot.activeOperation
        ? {
            lastOperation: {
              action: snapshot.activeOperation.action,
              status: snapshot.activeOperation.status,
              operationId: snapshot.activeOperation.operationId,
              updatedAt: snapshot.activeOperation.updatedAt,
            },
          }
        : {}),
      ...(snapshot.failure
        ? {
            lastFailure: {
              stage: snapshot.failure.stage,
              type: snapshot.failure.type,
              code: snapshot.failure.code,
              occurredAt: snapshot.failure.occurredAt,
            },
          }
        : {}),
      lastHealthCheck: {
        status: snapshot.health.status,
        checkedAt: snapshot.health.lastCheckedAt ?? snapshot.updatedAt,
        reasons: snapshot.health.reasons,
      },
    },
  }
}

function buildArtifactStatus(
  agentVersion: string | undefined,
  config: BridgeConfig,
  audits: NonNullable<EnvironmentSnapshot['commandAudits']>,
) {
  const verifyAudit = [...audits]
    .reverse()
    .find((audit) => audit.stage === 'verify_checksum')

  return {
    source: config.openClawInstallSource === 'npm'
      ? ('unknown' as const)
      : config.installerDownloadUrl.startsWith('bundled://')
        ? ('bundled' as const)
        : ('unknown' as const),
    checksumConfigured: config.installerChecksum !== 'dev-skip-checksum',
    checksumValidation:
      !verifyAudit
        ? ('not-run' as const)
        : verifyAudit.failureCode
          ? ('failed' as const)
          : ('passed' as const),
    targetDistro: config.targetDistro,
    agentVersion,
  }
}

function createInitialSnapshotBaseRuntimeVersion() {
  return '1.0.0'
}

function describeNextStep(
  failure: FailureSnapshot | undefined,
  snapshot: EnvironmentSnapshot,
) {
  const suggested = snapshot.recovery?.recommendedAction
  if (suggested === 'retry') {
    return '优先重试，不改动现有隔离环境。'
  }
  if (suggested === 'rebuild') {
    return '建议重建隔离环境。'
  }
  if (suggested === 'delete') {
    return '如不再需要，可删除本地隔离环境。'
  }
  if (suggested === 'go_fix') {
    return '先根据修复提示处理阻塞项。'
  }
  if (suggested === 'contact_support') {
    return '导出诊断包并联系支持。'
  }

  switch (failure?.suggestedRecovery) {
    case 'retry':
      return '重试当前动作。'
    case 'rebuild':
      return '重建当前隔离环境。'
    case 'delete':
      return '删除当前隔离环境。'
    case 'refresh_snapshot':
      return '刷新当前状态并以最新 snapshot 为准。'
    case 'view_fix_instructions':
      return '先查看修复方法，再继续。'
    case 'contact_support':
      return '导出诊断包并联系支持。'
    default:
      return snapshot.installation.state === 'not-installed'
        ? '开始安装以准备本地隔离环境。'
        : '继续使用当前环境。'
  }
}
