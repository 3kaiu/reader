export function withPerformanceMonitoring(
  operation: string,
  getMonitor: () => { record: (name: string, duration: number, success: boolean, metadata?: Record<string, unknown>) => void }
) {
  return function <TThis, TArgs extends unknown[], TResult>(
    target: (this: TThis, ...args: TArgs) => Promise<TResult>,
    context: ClassMethodDecoratorContext<TThis, (this: TThis, ...args: TArgs) => Promise<TResult>>
  ) {
    return async function (this: TThis, ...args: TArgs): Promise<TResult> {
      const monitor = getMonitor()
      const startTime = Date.now()

      try {
        const result = await target.apply(this, args)
        monitor.record(operation, Date.now() - startTime, true, {
          method: context.name,
          argsCount: args.length,
        })
        return result
      } catch (error) {
        monitor.record(operation, Date.now() - startTime, false, {
          method: context.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        throw error
      }
    }
  }
}
