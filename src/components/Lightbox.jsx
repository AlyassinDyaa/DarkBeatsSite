import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { asset, buyable, commissions, day, shows } from '../data/site'
import { useFinePointer } from '../hooks/useMedia'
import Poster from './Poster'
import Buy from './Buy'

/* One piece, large and uncropped, with its details beside it. Browse with a sideways swipe, the arrow buttons or the arrow keys; a tap outside the
   picture, the × or Escape closes it. `sel` is the index of the open piece in `items`, or null. */
export default function Lightbox({ items, sel, setSel }) {
  const [dx, setDx] = useState(0) // how far a finger has pulled the open picture sideways
  const box = useRef(null)
  const mouse = useFinePointer()
  const open = sel != null && items[sel] != null
  const count = items.length
  const many = count > 1
  const piece = open ? items[sel] : null
  const step = useCallback((by) => setSel((s) => (s == null ? s : (s + by + count) % count)), [count, setSel])

  useEffect(() => {
    if (!open) return
    const key = (e) => { if (e.key === 'Escape') setSel(null); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, step, setSel])

  // while a picture is open the page behind it stays put
  useEffect(() => {
    if (!open) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.__lenis?.stop?.()
    return () => { document.body.style.overflow = before; window.__lenis?.start?.() }
  }, [open])

  // Swiping. Plain browser listeners, so a sideways pull can be claimed from the page outright.
  useEffect(() => {
    const el = box.current
    if (!open || !el) return
    let touch = null // { x, y, way: null | 'side' | 'updown', dx }
    const start = (e) => { touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, way: null, dx: 0 } : null }
    const drift = (e) => {
      if (!touch) return
      const x = e.touches[0].clientX - touch.x, y = e.touches[0].clientY - touch.y
      if (!touch.way) {
        if (Math.abs(x) < 6 && Math.abs(y) < 6) return // still could be a tap
        touch.way = Math.abs(x) > Math.abs(y) ? 'side' : 'updown'
      }
      if (touch.way !== 'side' || !many) return
      if (e.cancelable) e.preventDefault()
      touch.dx = x
      setDx(x)
    }
    const end = () => {
      const t = touch
      touch = null
      setDx(0)
      if (t && t.way === 'side' && many && Math.abs(t.dx) > 50) step(t.dx < 0 ? 1 : -1)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', drift, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', drift)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [open, many, step])

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={box} className="lightbox" role="dialog" aria-modal="true" aria-label={piece.title || 'Picture'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={() => setSel(null)} data-lenis-prevent>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={piece.slug || sel} className={`lightbox-art ${piece.src ? '' : 'is-card'}`} style={{ x: dx }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
                {piece.src
                  ? <img src={asset(piece.src)} alt={piece.title || ''} draggable="false" />
                  : <Poster title={piece.title} hue={piece.hue} seed={sel} />}
              </motion.div>
            </AnimatePresence>
            <div className="lightbox-info">
              {(piece.category || piece.date) && <div className="label accent">{[piece.category, day(piece.date)].filter(Boolean).join(' · ')}</div>}
              {piece.title && <h2 className="display h-md">{piece.title}</h2>}
              {piece.note && <p className="dim">{piece.note}</p>}
              <Buy key={piece.slug || sel} piece={piece} />
              <div className="lightbox-actions">
                {piece.link && <a className="btn ghost sm" href={piece.link} target="_blank" rel="noreferrer">See the post <span className="arrow">↗</span></a>}
                {shows('pages', 'commissions') && commissions.open && <Link className={`btn sm ${buyable(piece) ? 'ghost' : ''}`} to="/commissions" onClick={() => setSel(null)}>Commission one like it</Link>}
              </div>
              <p className="lightbox-hint">{many ? `${sel + 1} / ${count} · ${mouse ? '← → to browse · Esc to close' : 'Swipe to browse'}` : mouse ? 'Esc to close' : ''}</p>
            </div>
          </div>
          {many && (
            <>
              <button className="lightbox-nav prev" onClick={(e) => { e.stopPropagation(); step(-1) }} aria-label="Previous piece">←</button>
              <button className="lightbox-nav next" onClick={(e) => { e.stopPropagation(); step(1) }} aria-label="Next piece">→</button>
            </>
          )}
          <button className="lightbox-x" onClick={() => setSel(null)} aria-label="Close">×</button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
