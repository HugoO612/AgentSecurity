import { join } from 'node:path'
import type {
  EnvironmentSnapshot,
  OperationSnapshot,
} from '../src/contracts/environment.ts'
import { BRIDGE_SCHEMA_VERSION, type BridgeConfig } from './config.ts'
import { ensureDirectory, readJsonFile, writeJsonFileAtomic } from './persistence.ts'
import { withDiagnostics } from './sample-payloads.ts'
import { type StateStore } from './state-store.ts'

type StoredOperation = {
  schemaVersion: number
  runningRecord: OperationSnapshot
  finalRecord: OperationSnapshot
  finalSnapshot: EnvironmentSnapshot
  expectedGenerationToWrite: number
  pollsRemaining: number
}

export class OperationStore {
  private readonly config: BridgeConfig

  constructor(config: BridgeConfig) {
    this.config = config
  }

  async savePendingOperation(operation: StoredOperation) {
    await ensureDirectory(this.config.operationsDir)
    await writeJsonFileAtomic(
      this.getOperationPath(operation.runningRecord.operationId),
      operation,
    )
  }

  async getOperation(operationId: string) {
    const stored = await readJsonFile<StoredOperation>(this.getOperationPath(operationId))

    if (!stored) {
      return null
    }

    if (stored.schemaVersion !== BRIDGE_SCHEMA_VERSION) {
      throw new Error(
        `Operation schema mismatch for ${operationId}: ${stored.schemaVersion}`,
      )
    }

    return stored
  }

  async advanceOperation(operationId: string, stateStore: StateStore) {
    const stored = await this.getOperation(operationId)

    if (!stored) {
      return null
    }

    if (stored.pollsRemaining > 0) {
      const nextStored = {
        ...stored,
        pollsRemaining: stored.pollsRemaining - 1,
      }
      await this.savePendingOperation(nextStored)
      return nextStored.runningRecord
    }

    const latestSnapshot = await stateStore.loadSnapshot()
    if (latestSnapshot.generation !== stored.expectedGenerationToWrite) {
      const staleRecord: OperationSnapshot = {
        ...stored.finalRecord,
        status: 'failed',
        stage: 'unknown',
        error: {
          stage: 'unknown',
          type: 'generation_conflict',
          code: 'generation_conflict',
          message: 'The operation finished against a stale generation.',
          retryable: true,
          occurredAt: new Date().toISOString(),
          suggestedRecovery: 'refresh_snapshot',
        },
      }
      await this.savePendingOperation({
        ...stored,
        runningRecord: staleRecord,
        finalRecord: staleRecord,
        pollsRemaining: 0,
      })
      return staleRecord
    }

    const finalSnapshot = withDiagnostics(stored.finalSnapshot, this.config)
    await stateStore.saveSnapshot(finalSnapshot)
    await this.savePendingOperation({
      ...stored,
      runningRecord: stored.finalRecord,
      finalRecord: stored.finalRecord,
      finalSnapshot,
      pollsRemaining: 0,
    })
    return stored.finalRecord
  }

  private getOperationPath(operationId: string) {
    return join(this.config.operationsDir, `${operationId}.json`)
  }
}
