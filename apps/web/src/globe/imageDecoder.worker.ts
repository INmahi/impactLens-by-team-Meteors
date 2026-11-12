// Fetches and decodes data PNGs off the main thread. The decode options keep the packed
// bytes exact: no premultiplied alpha, no colour-space conversion (data-contract skill).
// Message in: { id, url }. Message out: { id, bitmap } (transferred) or { id, error }.
interface Request {
  id: number
  url: string
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

scope.onmessage = async (e) => {
  const { id, url } = e.data
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    scope.postMessage({ id, bitmap }, [bitmap])
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
