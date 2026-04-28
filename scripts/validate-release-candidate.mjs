import { access, readFile } from 'node:fs/promises'

const requiredFiles = [
  'docs/go-no-go.md',
  'docs/real-machine-validation-template.md',
  'docs/release-evidence-template.json',
  'docs/release-checklist.md',
]

const requiredLifecycleActions = [
  'install',
  'start_agent',
  'stop_agent',
  'rebuild_environment',
  'delete_environment',
]

for (const file of requiredFiles) {
  try {
    await access(file)
  } catch {
    console.error(`Missing required release candidate artifact: ${file}`)
    process.exit(1)
  }
}

try {
  JSON.parse(await readFile('docs/release-evidence-template.json', 'utf8'))
} catch (error) {
  console.error('Release evidence template is not valid JSON.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const evidencePath = parseEvidencePath(process.argv.slice(2))
if (evidencePath) {
  try {
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
    validateReleaseEvidence(evidence)
    console.log('Release candidate evidence passed live gating checks.')
  } catch (error) {
    console.error('Release evidence failed public launch checks.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

console.log('Release candidate documentation artifacts are present.')
console.log('Manual gate: real Windows validation must still be completed in live mode.')

function parseEvidencePath(argv) {
  const index = argv.indexOf('--evidence')
  if (index === -1) {
    return undefined
  }

  const path = argv[index + 1]
  if (!path) {
    throw new Error('--evidence requires a file path.')
  }

  return path
}

function validateReleaseEvidence(evidence) {
  if (evidence.executionMode !== 'live') {
    throw new Error('executionMode must be "live" for public launch evidence.')
  }

  if (evidence.targetDistro !== 'AgentSecurity') {
    throw new Error('targetDistro must be "AgentSecurity" for public launch evidence.')
  }

  if (Array.isArray(evidence.shimmedCommands) && evidence.shimmedCommands.length > 0) {
    throw new Error('shimmedCommands must be empty for public launch evidence.')
  }

  for (const action of requiredLifecycleActions) {
    const step = evidence.lifecycle?.find((item) => item.action === action)
    if (!step) {
      throw new Error(`Missing required lifecycle evidence for action "${action}".`)
    }
    if (step.finalStatus !== 'succeeded') {
      throw new Error(`Lifecycle action "${action}" did not succeed.`)
    }
  }

  if (evidence.supportBundleChecks?.containsBridgeToken !== false) {
    throw new Error('Support bundle evidence indicates bridge token leakage.')
  }
  if (evidence.supportBundleChecks?.containsLocalAppDataPath !== false) {
    throw new Error('Support bundle evidence indicates host path leakage.')
  }
  if (evidence.supportBundleChecks?.containsAuthorizationHeader !== false) {
    throw new Error('Support bundle evidence indicates authorization header leakage.')
  }
  if (evidence.supportBundleChecks?.containsRedactedMarkers !== true) {
    throw new Error('Support bundle evidence must prove redaction markers are present.')
  }

  if (evidence.residualItems?.distroPresentAfterDelete !== false) {
    throw new Error('Delete evidence must confirm the dedicated distro is gone after uninstall.')
  }

  if (evidence.goNoGo?.decision !== 'go') {
    throw new Error('goNoGo.decision must be "go" before public launch.')
  }
}
