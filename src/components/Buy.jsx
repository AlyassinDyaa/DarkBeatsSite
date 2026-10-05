import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { brand, buyable, money, shop } from '../data/site'

const EASE = [0.16, 1, 0.3, 1]

/* "Australia, New Zealand and 3 more", from the two-letter codes set in the admin. */
function shipsTo(codes) {
  const list = (Array.isArray(codes) ? codes : []).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
  if (!list.length) return ''
  let names = list
  try { const region = new Intl.DisplayNames(['en'], { type: 'region' }); names = list.map((c) => region.of(c) || c) } catch { /* the codes will do */ }
  return names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', ').replace(/, ([^,]*)$/, ' and $1')
}

/* The price of a piece and the button that buys it. Shown only while online purchases are
   switched on in the admin and the piece has a price. The button asks the site's own checkout
   function (api/checkout.js) for a Stripe payment page and sends the buyer there. While it waits
   the button says so; if it cannot get there, a note slides in under it with another way to buy. */
export default function Buy({ piece }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  if (!buyable(piece)) return null
  const where = shop.shipping !== false ? shipsTo(shop.countries) : ''
  const buy = async () => {
    if (busy) return
    setBusy(true); setNote('')
    try {
      const answer = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: piece.slug }) })
      const said = await answer.json().catch(() => ({}))
      if (answer.ok && said.url) { window.location.href = said.url; return } // stays "busy" while the page changes
      setNote(said.message || 'The checkout did not answer. Try again in a moment.')
    } catch {
      setNote('Could not reach the checkout. Check the connection and try again.')
    }
    setBusy(false)
  }
  return (
    <motion.div className="buy" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.45, ease: EASE }}>
      <div className="buy-head">
        <span className="buy-price">{money(piece.price)}</span>
        {shop.note && <span className="buy-what">{shop.note}</span>}
      </div>
      <button type="button" className={`buy-btn ${busy ? 'is-busy' : ''}`} onClick={buy} aria-busy={busy}>
        <span className="buy-btn-label">{busy ? 'Opening secure checkout' : shop.buttonLabel}</span>
        <span className="buy-btn-icon" aria-hidden="true">{busy ? <i className="buy-spin" /> : '→'}</span>
      </button>
      <p className="buy-secure">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10.5h12v9.5H6z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
        <span>Secure checkout by Stripe{where ? ` · Ships to ${where}` : ''}</span>
      </p>
      <AnimatePresence>
        {note && (
          <motion.div className="buy-note" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            <p>{note}</p>
            {brand.email && <a href={`mailto:${brand.email}?subject=${encodeURIComponent(`Buying "${piece.title}"`)}`}>Email {brand.email} <span aria-hidden="true">→</span></a>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
