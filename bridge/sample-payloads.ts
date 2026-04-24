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
      distroName: 'AgentSecurity',
      agentName: 'OpenClaw',
      agentVersion: '0.1.0',
    },
    checks: [],
    health: {
      status: 'unknown',
      startupFailureCount: 0,
      lastCheckedAt: now,
    },
    capabilities: {
      canRunPrecheck: true,
      canInstall: false,
      canRetry: false,
      canStart: false,
      canStop: false,
      canRestart: false,
      canRebuild: false,
      canDelete: false,
      canRequestPermission: true,
    },
    actionLocks: [],
    diagnostics: emptyDiagnostics(config.port),
  }

  return withDiagnostics(snapshot, config)
}

export function withDiagnostics(
  snapshot: EnvironmentSnapshot,
  config: BridgeConfig,
): EnvironmentSnapshot {
  return {
    ...snapshot,
    diagnostics: buildDiagnostics(snapshot, config.port),
  }
}

export function emptyDiagnostics(port: number): DiagnosticsSummary {
  return {
    userSummary: {
      conclusion: '当前尚未安装本地隔离环境。',
      recommendedNextStep: '先执行预检。',
      retryable: true,
    },
    supportSummary: {
      bridgeVersion: BRIDGE_VERSION,
      port,
      generation: 0,
      runtimeLocation: 'wsl2',
    },
  }
}

export function buildDiagnostics(
  snapshot: EnvironmentSnapshot,
  port: number,
): DiagnosticsSummary {
  return {
    userSummary: {
      conclusion:
        snapshot.failure?.message ??
        (snapshot.installation.state === 'not-installed'
          ? '当前尚未安装本地隔离环境。'
          : '当前运行环境状态正常。'),
      recommendedNextStep: describeNextStep(snapshot.failure),
      retryable: snapshot.failure?.retryable ?? false,
    },
    supportSummary: {
      bridgeVersion: BRIDGE_VERSION,
      port,
      generation: snapshot.generation,
      runtimeLocation: snapshot.runtime.location,
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

function describeNextStep(failure?: FailureSnapshot) {
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
      return '复制诊断摘要并联系支持。'
    default:
      return failure ? '按推荐动作继续恢复。' : '继续使用当前环境。'
  }
}
