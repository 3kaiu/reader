import { nexusDBConfig } from './config'
import { NexusDB } from './runtime'

let nexusDBInstance: NexusDB | null = null
let nexusDBStub: NexusDB | null = null

function createIndexedDbUnavailableStub(): NexusDB {
  const error = new Error('IndexedDB is not available in this environment')
  const stub = {
    put: async () => {
      throw error
    },
    getAll: async () => {
      throw error
    },
    get: async () => {
      throw error
    },
    delete: async () => {
      throw error
    },
    clear: async () => {
      throw error
    },
  }

  return stub as unknown as NexusDB
}

export function getNexusDB(): NexusDB {
  if (typeof indexedDB === 'undefined') {
    if (!nexusDBStub) {
      nexusDBStub = createIndexedDbUnavailableStub()
    }
    return nexusDBStub
  }

  if (!nexusDBInstance) {
    nexusDBInstance = new NexusDB(nexusDBConfig)
  }

  return nexusDBInstance
}

export const nexusDB = getNexusDB()
