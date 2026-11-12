// Decodes a data PNG to an ImageBitmap with the exact-bytes options, in a worker when one
// can be started, otherwise on the main thread (same options either way).
const DECODE_OPTIONS: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }

type Pending = { resolve: (b: ImageBitmap) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let workerFailed = false
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker
  try {
    worker = new Worker(new URL('./imageDecoder.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; bitmap?: ImageBitmap; error?: string }>) => {
      const p = pending.get(e.data.id)
      if (!p) {
        e.data.bitmap?.close()
        return
      }
      pending.delete(e.data.id)
      if (e.data.bitmap) p.resolve(e.data.bitmap)
      else p.reject(new Error(e.data.error ?? 'image decode failed'))
    }
    worker.onerror = (e) => {
      // The worker itself failed (not one decode): fail what is in flight, fall back to the main thread.
      e.preventDefault()
      workerFailed = true
      worker?.terminate()
      worker = null
      for (const p of pending.values()) p.reject(new Error('image decoder worker failed'))
      pending.clear()
    }
  } catch {
    workerFailed = true
    worker = null
  }
  return worker
}

async function decodeOnMainThread(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return createImageBitmap(await res.blob(), DECODE_OPTIONS)
}

/** Fetches `url` and decodes it with premultiplyAlpha 'none' and colorSpaceConversion 'none'. */
export function decodeImage(url: string): Promise<ImageBitmap> {
  const w = getWorker()
  if (!w) return decodeOnMainThread(url)
  const id = nextId++
  const absolute = new URL(url, location.href).href
  return new Promise<ImageBitmap>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, url: absolute })
  }).catch((err: unknown) => {
    // Worker died mid-request: retry once on the main thread.
    if (workerFailed) return decodeOnMainThread(url)
    throw err
  })
}
