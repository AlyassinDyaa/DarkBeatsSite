import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import '@fontsource/anton'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/jetbrains-mono'

// VITE_ROUTER=hash builds a single-URL preview (e.g. for hosts without SPA fallback).
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter
import App from './App'
import CardView from './pages/CardView'
import { applyBrandHue } from './hooks/useHue'
import { showLatest } from './data/site'
import './styles/global.css'
import './styles/components.css'

/* The artwork stays on the site: no "Save image" / "Copy image" menu on a picture (right-click on a
   computer, a long press on Android), and pictures cannot be dragged out to the desktop. iPhones
   are covered in global.css (-webkit-touch-callout). A screenshot still works (no site can stop
   that): this takes away the easy ways. The admin is its own page, so none of this reaches it. */
const isArt = (t) => t instanceof Element && Boolean(t.closest('img, picture, video, svg image'))
addEventListener('contextmenu', (e) => { if (isArt(e.target)) e.preventDefault() })
addEventListener('dragstart', (e) => { if (isArt(e.target)) e.preventDefault() })

// /card-view: one member's card on its own (the admin's "See their card" window), no menu or footer
const cardOnly = /\/card-view\/?$/.test(location.pathname)
const start = () => cardOnly ? (applyBrandHue(), document.documentElement.classList.add('is-card-view'), createRoot(document.getElementById('root')).render(<StrictMode><CardView /></StrictMode>)) : createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router basename={import.meta.env.VITE_ROUTER === 'hash' ? '/' : import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <App />
    </Router>
  </StrictMode>,
)

/* An admin who has just saved wants to see the result now, not after the site has rebuilt.
   The admin panel and the site share this address, so the site can tell an admin's browser by
   the login it keeps. For that browser only, ask for anything saved since this build and lay it
   over the built-in content before the first draw (api/content.js). Everyone else starts at once. */
const pass = (() => { try { return JSON.parse(localStorage.getItem('decap-cms-user') || '{}').token } catch { return null } })()
if (typeof pass === 'string' && pass.startsWith('ia.') && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  const giveUp = new AbortController()
  const timer = setTimeout(() => giveUp.abort(), 3500)
  fetch('/api/content', { headers: { Authorization: `Bearer ${pass}` }, cache: 'no-store', signal: giveUp.signal })
    .then((answer) => (answer.ok ? answer.json() : null))
    .then((latest) => { if (latest && latest.fresh) showLatest(latest) })
    .catch(() => { /* no answer in time: show the built-in content */ })
    .finally(() => { clearTimeout(timer); start() })
} else {
  start()
}
