// The app's only way to run a trend analysis: analyzeTrend() from @trend/stats,
// executed in a Web Worker so the globe never stalls.
import type { TrendInput, TrendReport } from '@trend/stats'
import StatsWorker from '@trend/stats/worker?worker'

type Reply = { id: number; ok: true; report: TrendReport } | { id: number; ok: false; error: string }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: TrendReport) => void; reject: (e: Error) => void }>()

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

export function runTrend(input: TrendInput): Promise<TrendReport> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, input })
  })
}
