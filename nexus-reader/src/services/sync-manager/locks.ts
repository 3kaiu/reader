type NavigatorWithLocks = Navigator & {
  locks?: {
    request(
      name: string,
      options: { ifAvailable: boolean },
      callback: (lock: Lock | null) => Promise<void>
    ): Promise<void>
  }
}

export async function withSyncQueueLock(processQueue: () => Promise<void>): Promise<void> {
  const navigatorWithLocks =
    typeof navigator === 'undefined' ? null : (navigator as NavigatorWithLocks)

  if (!navigatorWithLocks?.locks) {
    await processQueue()
    return
  }

  try {
    await navigatorWithLocks.locks.request(
      'nexus_sync_queue_lock',
      { ifAvailable: true },
      async lock => {
        if (!lock) {
          return
        }

        await processQueue()
      }
    )
  } catch {
    await processQueue()
  }
}
