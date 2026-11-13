import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Loading screen (index.html #splash): dissolves into the app once the page has loaded and the
// screen has been up for at least MIN_SHOWN_MS, so it never just flashes.
const MIN_SHOWN_MS = 2400
function hideSplash() {
  const el = document.getElementById('splash')
  if (!el) return
  const wait = Math.max(0, MIN_SHOWN_MS - performance.now()) // performance.now() = time since the page opened
  setTimeout(() => {
    el.classList.add('splash-out')
    const remove = () => el.remove()
    el.addEventListener('transitionend', remove, { once: true })
    setTimeout(remove, 2400) // reduced motion: no transition event
  }, wait)
}
if (document.readyState === 'complete') hideSplash()
else window.addEventListener('load', hideSplash, { once: true })
