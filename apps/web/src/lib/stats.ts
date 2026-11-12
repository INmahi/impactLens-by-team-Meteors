// The app's only way to run statistics: @trend/stats executed in a Web Worker so the globe never stalls.
// runStats(type, input) covers every message type in packages/stats/src/dispatch.ts.
import type { StatsMessages, StatsMessageType, TrendInput, TrendReport } from '@trend/stats'
import StatsWorker from '@trend/stats/worker?worker'

type Reply = { id: number; ok: true; report: unknown } | { id: number; ok: false; error: string }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new StatsWorker()
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const reply = e.data
    const job = pending.get(reply.id)
    if (!job) return
    pending.delete(reply.id)
    if (reply.ok) job.resolve(reply.report)
    else job.reject(new Error(reply.error))
  }
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Stats worker failed')
    for (const job of pending.values()) job.reject(err)
    pending.clear()
  }
  return worker
}

export function runStats<K extends StatsMessageType>(
  type: K,
  input: StatsMessages[K]['input'],
): Promise<StatsMessages[K]['report']> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (r: unknown) => void, reject })
    getWorker().postMessage({ id, type, input })
  })
}

export const runTrend = (input: TrendInput): Promise<TrendReport> => runStats('trend', input)
