import { useEffect, useState } from 'react'
import { useCart } from '../hooks/useCart'
import { AnimatePresence, motion } from 'framer-motion'
import { badge, brand, buyable, money, payLine, payWays, priceOf, shop, sizesOf, soldOut } from '../data/site'

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
  // a signature, when the admin offers one: a single switch, off to start with
  const [signed, setSigned] = useState(false)
  // a size, when the piece comes in more than one: the first on the list to start with
  const sizes = sizesOf(piece)
  const [size, setSize] = useState(sizes[0]?.name)
  const chosen = sizes.find((s) => s.name === size) ? size : sizes[0]?.name
  const cost = priceOf(piece, chosen)
  const cart = useCart()
  const [added, setAdded] = useState(false)
  useEffect(() => { if (!added) return; const t = setTimeout(() => setAdded(false), 1800); return () => clearTimeout(t) }, [added])
  const addToCart = () => { cart.add(piece.slug, choice && signed, chosen); setAdded(true); setTimeout(() => cart.setOpen(true), 350) }
  const inCart = cart.lines.filter((l) => l.slug === piece.slug).reduce((n, l) => n + l.qty, 0)
  if (!buyable(piece)) return null
  const where = shop.shipping !== false ? shipsTo(shop.countries) : ''
  const out = soldOut(piece)
  const choice = Boolean(shop.signedChoice)
  const extra = choice && signed ? Math.max(0, Number(shop.signedExtra) || 0) : 0
  const tag = badge(piece)
  // `busy` names the way to pay that is opening (stripe or paypal)
  const buy = async (way) => {
    if (busy || out) return
    setBusy(way); setNote('')
    try {
      const answer = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: way, slug: piece.slug, ...(choice ? { signed } : {}), ...(chosen ? { size: chosen } : {}) }) })
      const said = await answer.json().catch(() => ({}))
      if (answer.ok && said.url) { window.location.assign(said.url); return } // stays "busy" while the page changes
      setNote(said.message || 'The checkout did not answer. Try again in a moment.')
    } catch {
      setNote('Could not reach the checkout. Check the connection and try again.')
    }
    setBusy(false)
  }
  return (
    <motion.div className="buy" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.45, ease: EASE }}>
      <div className="buy-head">
        <div className="buy-amount">
          {cost.sale && <s className="buy-was">{money(cost.was + extra, true)}</s>}
          <span className={`buy-price ${out ? 'is-out' : ''}`}>{money(cost.now + extra)}</span>
        </div>
        {tag && <span className={`tile-badge buy-badge is-${tag.kind}`}>{tag.text}</span>}
      </div>
      {piece.what && <p className="buy-what">{piece.what}</p>}
      {cost.sale && !out && <p className="buy-save">You save {money(cost.was - cost.now)}</p>}
      {sizes.length > 0 && !out && (
        <div className="buy-sizes" role="radiogroup" aria-label="Size">
          <span className="buy-sizes-label">Size</span>
          <div className="buy-sizes-row">
            {sizes.map((s) => {
              const p = priceOf(piece, s.name)
              const on = s.name === chosen
              return (
                <button key={s.name} type="button" role="radio" aria-checked={on} className={`buy-size ${on ? 'on' : ''}`} onClick={() => setSize(s.name)}>
                  <strong>{s.name}</strong>
                  <small>{p.sale && <s>{money(p.was + extra, true)}</s>}{money(p.now + extra, true)}</small>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {choice && !out && (
        <button type="button" role="switch" aria-checked={signed} className={`buy-sign ${signed ? 'on' : ''}`} onClick={() => setSigned(!signed)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c2.500-.500 3.500-4 5-4s1 3 3 3 2.500-5 4.500-5 1 4 2.500 4 1.500-1 2.500-1.500 M4 21h16" /></svg>
          <span className="buy-sign-text">
            <strong>Signed by {brand.artist ? brand.artist.split(' ')[0] : 'the artist'}</strong>
            <small>{Number(shop.signedExtra) > 0 ? `Add a signature for ${money(shop.signedExtra, true)}` : 'Add a signature at no extra cost'}</small>
          </span>
          <i className="buy-sign-toggle" aria-hidden="true" />
        </button>
      )}
      {out ? (
        <>
          <span className="buy-btn is-out" aria-disabled="true"><span className="buy-btn-label">Sold out</span></span>
          <p className="buy-secure"><span>This one has gone. {brand.email && <a href={`mailto:${brand.email}?subject=${encodeURIComponent(`About "${piece.title}"`)}`}>Ask about a reprint or a commission</a>}</span></p>
        </>
      ) : (
        <>
          <button type="button" className={`buy-btn ${added ? 'is-added' : ''}`} onClick={addToCart}>
            <span className="buy-btn-label">{added ? 'Added to cart' : 'Add to cart'}</span>
            <span className="buy-btn-icon" aria-hidden="true">{added ? '✓' : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14 M5 12h14" /></svg>}</span>
          </button>
          <div className="buy-also">
            {payWays().map((way, i) => (
              <button key={way} type="button" className={`buy-now ${way === 'paypal' ? 'is-paypal' : ''} ${busy === way ? 'is-busy' : ''}`} onClick={() => buy(way)} aria-busy={busy === way} disabled={Boolean(busy)}>
                {busy === way ? (way === 'paypal' ? 'Opening PayPal…' : 'Opening secure checkout…') : way === 'paypal' ? (i ? 'or PayPal' : `${shop.buttonLabel} with PayPal`) : `${shop.buttonLabel} now`} <span aria-hidden="true">→</span>
              </button>
            ))}
            {inCart > 0 && <button type="button" className="buy-incart" onClick={() => cart.setOpen(true)}>{inCart} in your cart</button>}
          </div>
          <p className="buy-secure">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10.5h12v9.5H6z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
            <span>{payLine()}{where ? ` · Ships to ${where}` : ''}</span>
          </p>
        </>
      )}
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
