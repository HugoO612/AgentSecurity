export function getHealthPath() {
  return '/health'
}

export function getSnapshotPath(environmentId: string) {
  return `/environments/${environmentId}/snapshot`
}

export function postActionsPath() {
  return '/actions'
}

export function postConfirmTokenPath() {
  return '/actions/confirm-token'
}

export function postInstallerStartPath() {
  return '/installer/start'
}

export function getOperationPath(environmentId: string, operationId: string) {
  return `/environments/${environmentId}/operations/${operationId}`
}

export function getInstallerOperationPath(operationId: string) {
  return `/installer/operations/${operationId}`
}

export function getDiagnosticsSummaryPath(environmentId: string) {
  return `/environments/${environmentId}/diagnostics/summary`
}

export function getDiagnosticsExportPath() {
  return '/diagnostics/export'
}

export function getEnvironmentReportPath() {
  return '/reports/environment'
}

export function getBoundaryReportPath() {
  return '/reports/boundary'
}

export function getDeleteReportPath() {
  return '/reports/delete-last'
}
