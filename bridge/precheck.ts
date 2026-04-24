import { lookup } from 'node:dns/promises'
import { statfs } from 'node:fs/promises'
import type { BridgeConfig } from './config.ts'
import { runAllowedCommand } from './command-runner.ts'
import type {
  FailureSnapshot,
  PrecheckItem,
} from '../src/contracts/environment.ts'

const DISK_BLOCK_BYTES = 2 * 1024 * 1024 * 1024
type WslFailureReason =
  | 'none'
  | 'not_enabled'
  | 'permission_denied'
  | 'policy_blocked'
  | 'unknown'

type WslStatus = {
  available: boolean
  virtualizationReady: boolean
  detail: string
  reason: WslFailureReason
}

export async function buildPrecheck(config: BridgeConfig) {
  const now = new Date().toISOString()
  const wsl = await detectWslAvailability()
  const disk = await checkDisk(config.runtimeDir)
  const network = await checkNetwork()

  const checks: PrecheckItem[] = [
    {
      code: 'windows_version',
      status: process.platform === 'win32' ? 'passed' : 'blocked',
      message:
        process.platform === 'win32'
          ? 'Windows version is supported.'
          : 'Only Windows hosts are supported in v1.',
      userAction: process.platform === 'win32' ? 'none' : 'manual_fix',
      updatedAt: now,
    },
    {
      code: 'wsl_status',
      status: wsl.available ? 'passed' : 'blocked',
      message: describeWslMessage(wsl),
      detail: wsl.detail,
      userAction: wsl.available
        ? 'none'
        : wsl.reason === 'permission_denied'
          ? 'request_permission'
          : 'manual_fix',
      updatedAt: now,
    },
    {
      code: 'virtualization',
      status: wsl.virtualizationReady ? 'passed' : 'blocked',
      message: describeVirtualizationMessage(wsl),
      detail: wsl.detail,
      userAction: wsl.virtualizationReady
        ? 'none'
        : wsl.reason === 'permission_denied'
          ? 'request_permission'
          : 'manual_fix',
      updatedAt: now,
    },
    {
      code: 'disk_space',
      status: disk.blocked ? 'blocked' : 'passed',
      message: disk.blocked
        ? 'Disk space is too low to create the environment.'
        : 'Disk space is sufficient.',
      detail: disk.detail,
      userAction: disk.blocked ? 'manual_fix' : 'none',
      updatedAt: now,
    },
    {
      code: 'network',
      status: network.available ? 'passed' : 'warning',
      message: network.available ? 'Network is reachable.' : 'Network is degraded.',
      detail: network.detail,
      userAction: network.available ? 'none' : 'retry',
      updatedAt: now,
    },
    {
      code: 'permission',
      status: wsl.reason === 'permission_denied' ? 'blocked' : 'warning',
      message:
        wsl.reason === 'permission_denied'
          ? 'Administrator permission is required before continuing.'
          : 'Administrator approval may be required later.',
      detail: wsl.reason === 'permission_denied' ? wsl.detail : undefined,
      userAction: 'request_permission',
      updatedAt: now,
    },
  ]

  const failure =
    checks.find((check) => check.status === 'blocked') !== undefined
      ? mapPrecheckFailure(checks, wsl)
      : undefined

  return {
    checks,
    failure,
  }
}

async function detectWslAvailability(): Promise<WslStatus> {
  if (process.platform !== 'win32') {
    return {
      available: false,
      virtualizationReady: false,
      detail: 'WSL checks only run on Windows hosts.',
      reason: 'unknown',
    }
  }

  try {
    const result = await runAllowedCommand('wsl.exe', ['--status'])
    const output = `${result.stdout}\n${result.stderr}`.trim()

    if (result.exitCode === 0) {
      return {
        available: true,
        virtualizationReady: true,
        detail: output,
        reason: 'none',
      }
    }

    const reason = classifyWslFailureReason(output)
    return {
      available: false,
      virtualizationReady: false,
      detail: output || 'wsl.exe --status returned a non-zero exit code.',
      reason,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'wsl.exe unavailable'
    const reason = classifyWslFailureReason(message)
    return {
      available: false,
      virtualizationReady: false,
      detail: message,
      reason,
    }
  }
}

async function checkDisk(runtimeDir: string) {
  try {
    const info = await statfs(runtimeDir)
    const freeBytes = info.bavail * info.bsize
    return {
      blocked: freeBytes < DISK_BLOCK_BYTES,
      detail: `Free bytes: ${freeBytes}`,
    }
  } catch (error) {
    return {
      blocked: false,
      detail: error instanceof Error ? error.message : 'Disk space unavailable',
    }
  }
}

async function checkNetwork() {
  try {
    await lookup('microsoft.com')
    return {
      available: true,
      detail: 'DNS lookup succeeded.',
    }
  } catch (error) {
    return {
      available: false,
      detail: error instanceof Error ? error.message : 'Network lookup failed.',
    }
  }
}

function mapPrecheckFailure(
  checks: PrecheckItem[],
  wsl: WslStatus,
): FailureSnapshot {
  const blocked = checks.find((check) => check.status === 'blocked')
  const permissionBlocked = checks.find(
    (check) => check.code === 'permission' && check.status === 'blocked',
  )
  const now = new Date().toISOString()

  if (permissionBlocked) {
    return {
      stage: 'permission',
      type: 'permission_required',
      code: 'permission_denied',
      message: '缺少必要权限，当前无法继续执行隔离环境准备。',
      detail: permissionBlocked.detail ?? wsl.detail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  if (blocked?.code === 'disk_space') {
    return {
      stage: 'precheck',
      type: 'disk_space_insufficient',
      code: 'disk_space_insufficient',
      message: '可用空间不足，当前无法创建隔离环境。',
      detail: blocked.detail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  if (blocked?.code === 'windows_version') {
    return {
      stage: 'precheck',
      type: 'unsupported_environment',
      code: 'windows_version_unsupported',
      message: '当前系统版本不满足隔离运行要求。',
      detail: blocked.detail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  if (blocked?.code === 'wsl_status') {
    if (wsl.reason === 'policy_blocked') {
      return {
        stage: 'wsl_enablement',
        type: 'unsupported_environment',
        code: 'wsl_policy_blocked',
        message: '系统策略阻止了 WSL，当前无法继续安装。',
        detail: blocked.detail,
        retryable: false,
        occurredAt: now,
        suggestedRecovery: 'view_fix_instructions',
      }
    }

    return {
      stage: 'wsl_enablement',
      type: 'missing_capability',
      code: 'wsl_not_enabled',
      message: 'WSL 尚未启用，当前无法继续安装。',
      detail: blocked.detail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  if (blocked?.code === 'virtualization') {
    if (wsl.reason === 'policy_blocked') {
      return {
        stage: 'wsl_detection',
        type: 'unsupported_environment',
        code: 'virtualization_policy_blocked',
        message: '系统策略阻止了虚拟化能力，当前无法继续安装。',
        detail: blocked.detail,
        retryable: false,
        occurredAt: now,
        suggestedRecovery: 'view_fix_instructions',
      }
    }

    return {
      stage: 'wsl_detection',
      type: 'missing_capability',
      code: 'virtualization_unavailable',
      message: '虚拟化能力不可用，当前无法继续安装。',
      detail: blocked.detail,
      retryable: false,
      occurredAt: now,
      suggestedRecovery: 'view_fix_instructions',
    }
  }

  return {
    stage: 'precheck',
    type: 'missing_capability',
    code: blocked?.code ?? 'precheck_blocked',
    message: '当前设备尚未满足隔离运行所需条件。',
    detail: blocked?.detail,
    retryable: false,
    occurredAt: now,
    suggestedRecovery: 'view_fix_instructions',
  }
}

function describeWslMessage(wsl: WslStatus) {
  if (wsl.available) {
    return 'WSL is available.'
  }

  if (wsl.reason === 'permission_denied') {
    return 'WSL check failed because permission is denied.'
  }

  if (wsl.reason === 'policy_blocked') {
    return 'WSL is blocked by system policy.'
  }

  if (wsl.reason === 'not_enabled') {
    return 'WSL is not enabled.'
  }

  return 'WSL is unavailable.'
}

function describeVirtualizationMessage(wsl: WslStatus) {
  if (wsl.virtualizationReady) {
    return 'Virtualization support is available.'
  }

  if (wsl.reason === 'policy_blocked') {
    return 'Virtualization is blocked by system policy.'
  }

  if (wsl.reason === 'permission_denied') {
    return 'Virtualization readiness cannot be confirmed without permission.'
  }

  return 'Virtualization support is unavailable.'
}

function classifyWslFailureReason(detail: string): WslFailureReason {
  const normalized = detail.toLowerCase()

  const permissionHints = [
    'access is denied',
    'permission denied',
    'requires elevation',
    'administrator privileges',
    '0x80070005',
    '拒绝访问',
  ]
  if (permissionHints.some((hint) => normalized.includes(hint))) {
    return 'permission_denied'
  }

  const policyHints = [
    'group policy',
    'blocked by policy',
    'disabled by policy',
    'disabled by your organization',
    '策略',
    '组织',
  ]
  if (policyHints.some((hint) => normalized.includes(hint))) {
    return 'policy_blocked'
  }

  const notEnabledHints = [
    'wsl is not enabled',
    'windows subsystem for linux has not been enabled',
    'optional component is not enabled',
    'feature is disabled',
    '0x80370114',
    '未启用',
  ]
  if (notEnabledHints.some((hint) => normalized.includes(hint))) {
    return 'not_enabled'
  }

  return 'unknown'
}
