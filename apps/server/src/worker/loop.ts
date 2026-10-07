import type { Database } from '../db/client.js'
import {
  createAdapters,
  DEFAULT_WORKER_OPTIONS,
  log,
  runOnce,
  type AdapterMap,
  type WorkerOptions,
} from './publisher.js'

export interface WorkerDeps {
  db: Database
  adapters: AdapterMap
  encryptionKey: string
  options?: Partial<WorkerOptions> & { pollIntervalMs?: number }
}

export interface RunningWorker {
  stop: () => Promise<void>
}

/** Starts the polling loop. `stop()` halts polling and waits for in-flight work. */
export function startWorker(deps: WorkerDeps): RunningWorker {
  const options: WorkerOptions = { ...DEFAULT_WORKER_OPTIONS, ...deps.options }
  const pollIntervalMs = deps.options?.pollIntervalMs ?? 12_000
  let stopped = false
  let inFlight: Promise<unknown> = Promise.resolve()
  let timer: NodeJS.Timeout | undefined

  const tick = async (): Promise<void> => {
    if (stopped) return
    try {
      const result = await runOnce(deps.db, deps.adapters, deps.encryptionKey, options)
      if (result.claimed > 0 || result.recovered > 0) {
        log.info(result, 'worker pass completed')
      }
    } catch (error) {
      log.error({ err: error }, 'worker pass failed')
    }
    if (!stopped) {
      timer = setTimeout(() => {
        inFlight = tick()
      }, pollIntervalMs)
      timer.unref?.()
    }
  }

  inFlight = tick()

  const stop = async (): Promise<void> => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    await inFlight
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void stop().then(() => process.exit(0))
    })
  }

  return { stop }
}

export { createAdapters }
