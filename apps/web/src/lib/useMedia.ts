import { useEffect, useState } from 'react'

/** True while the media query matches (SSR-safe default false). */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

/** Phone layout below 768 px (glass-ui skill). */
export const usePhone = () => useMedia('(max-width: 767px)')
