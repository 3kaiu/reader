import { nexusDBConfig } from './config'
import { NexusDB } from './runtime'

let nexusDBInstance: NexusDB | null = null

export function getNexusDB(): NexusDB {
  if (!nexusDBInstance) {
    nexusDBInstance = new NexusDB(nexusDBConfig)
  }

  return nexusDBInstance
}

export const nexusDB = getNexusDB()
