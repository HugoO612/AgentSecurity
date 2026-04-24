export function getHealthPath() {
  return '/health'
}

export function getSnapshotPath(environmentId: string) {
  return `/environments/${environmentId}/snapshot`
}

export function postActionsPath() {
  return '/actions'
}

export function getOperationPath(environmentId: string, operationId: string) {
  return `/environments/${environmentId}/operations/${operationId}`
}

export function getDiagnosticsSummaryPath(environmentId: string) {
  return `/environments/${environmentId}/diagnostics/summary`
}
