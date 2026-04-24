import type { EnvironmentSnapshot } from '../src/contracts/environment.ts'
import { BRIDGE_SCHEMA_VERSION, type BridgeConfig } from './config.ts'
import { readJsonFile, writeJsonFileAtomic } from './persistence.ts'
import { createInitialSnapshot } from './sample-payloads.ts'

type PersistedEnvironmentState = {
  schemaVersion: number
  snapshot: EnvironmentSnapshot
}

export class StateStore {
  private readonly config: BridgeConfig

  constructor(config: BridgeConfig) {
    this.config = config
  }

  async loadSnapshot() {
    const persisted = await readJsonFile<PersistedEnvironmentState>(
      this.config.stateFile,
    )

    if (!persisted) {
      const initialSnapshot = createInitialSnapshot(this.config)
      await this.saveSnapshot(initialSnapshot)
      return initialSnapshot
    }

    if (persisted.schemaVersion !== BRIDGE_SCHEMA_VERSION) {
      throw new SchemaVersionMismatchError(
        persisted.schemaVersion,
        BRIDGE_SCHEMA_VERSION,
      )
    }

    return persisted.snapshot
  }

  async saveSnapshot(snapshot: EnvironmentSnapshot) {
    await writeJsonFileAtomic(this.config.stateFile, {
      schemaVersion: BRIDGE_SCHEMA_VERSION,
      snapshot,
    } satisfies PersistedEnvironmentState)
  }
}

export class SchemaVersionMismatchError extends Error {
  readonly actualVersion: number
  readonly expectedVersion: number

  constructor(
    actualVersion: number,
    expectedVersion: number,
  ) {
    super(
      `Bridge state schema mismatch: expected ${expectedVersion}, received ${actualVersion}`,
    )
    this.actualVersion = actualVersion
    this.expectedVersion = expectedVersion
    this.name = 'SchemaVersionMismatchError'
  }
}
