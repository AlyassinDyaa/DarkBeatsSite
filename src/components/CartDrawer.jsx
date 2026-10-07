import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { asset, brand, money, payLine, payWays, shop } from '../data/site'
import { useCart } from '../hooks/useCart'

const EASE = [0.16, 1, 0.3, 1]

/* Open the checkout for everything in the cart: the site's checkout function makes one Stripe
   payment page with a line per print, and sends the visitor there. */
async function checkout(items, provider) {
  try {
    const answer = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, provider }) })
    const said = await answer.json().catch(() => ({}))
    if (answer.ok && said.url) { window.location.href = said.url; return null }
    return said.message || 'The checkout did not answer. Try again in a moment.'
  } catch {
    return 'Could not reach the checkout. Check the connection and try again.'
  }
}

/* The cart, sliding in from the right: each print with its picture, signed or not, how many and
   what it comes to; the total; one button to pay for all of it. */
export default function CartDrawer() {
  const cart = useCart()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const { open, lines } = cart
  const setOpen = (v) => { if (!v) setNote(''); cart.setOpen(v) }

  useEffect(() => {
    if (!open) return
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.__lenis?.stop?.()
    addEventListener('keydown', key)
    return () => { removeEventListener('keydown', key); document.body.style.overflow = before; if (!document.querySelector('.lightbox')) window.__lenis?.start?.() }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // `busy` names the way to pay that is opening (stripe or paypal)
  const pay = async (way) => {
    if (busy || !lines.length) return
    setBusy(way); setNote('')
    const problem = await checkout(lines.map((l) => ({ slug: l.slug, size: l.size, signed: l.signed, qty: l.qty })), way)
    if (problem) { setNote(problem); setBusy(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={() => setOpen(false)} data-lenis-prevent>
          <motion.aside className="cart-panel" role="dialog" aria-modal="true" aria-label="Your cart" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.45, ease: EASE }} onClick={(e) => e.stopPropagation()}>
            <header className="cart-head">
              <div>
                <div className="label accent">Your cart</div>
                <h2 className="display h-sm">{cart.count ? `${cart.count} ${cart.count === 1 ? 'print' : 'prints'}` : 'Empty for now'}</h2>
              </div>
              <button type="button" className="cart-x" onClick={() => setOpen(false)} aria-label="Close the cart">×</button>
            </header>

            {lines.length === 0 ? (
              <div className="cart-empty">
                <p>Nothing in here yet. Open any piece in the Shop and press <b>Add to cart</b>.</p>
                <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Keep looking</button>
              </div>
            ) : (
              <>
                <ul className="cart-lines">
                  <AnimatePresence initial={false}>
                    {lines.map((l) => (
                      <motion.li key={l.key} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30, height: 0, marginBottom: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                        <span className="cart-thumb">{l.piece.src && <img src={asset(l.piece.src)} alt="" />}</span>
                        <div className="cart-info">
                          <strong>{l.piece.title}</strong>
                          <small>{[l.size, shop.signedChoice ? (l.signed ? 'Signed' : 'Unsigned') : '', l.piece.what].filter(Boolean).join(' · ')}</small>
                          <div className="cart-row">
                            <div className="cart-qty" role="group" aria-label={`How many of ${l.piece.title}`}>
                              <button type="button" onClick={() => (l.qty > 1 ? cart.setQty(l.slug, l.signed, l.size, l.qty - 1) : cart.remove(l.slug, l.signed, l.size))} aria-label="One fewer">−</button>
                              <span aria-live="polite">{l.qty}</span>
                              <button type="button" onClick={() => cart.setQty(l.slug, l.signed, l.size, l.qty + 1)} disabled={l.qty >= cart.max} aria-label="One more">+</button>
                            </div>
                            <span className="cart-price">{money(l.each * l.qty)}</span>
                          </div>
                        </div>
                        <button type="button" className="cart-remove" onClick={() => cart.remove(l.slug, l.signed, l.size)} aria-label={`Remove ${l.piece.title}`}>×</button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>

                <footer className="cart-foot">
                  <div className="cart-total"><span>Total</span><strong>{money(cart.total)}</strong></div>
                  {shop.shipping !== false && <p className="cart-small">You enter your delivery address on the next page.</p>}
                  {payWays().map((way) => (
                    <button key={way} type="button" className={`buy-btn ${way === 'paypal' ? 'is-paypal' : ''} ${busy === way ? 'is-busy' : ''}`} onClick={() => pay(way)} aria-busy={busy === way} disabled={Boolean(busy)}>
                      <span className="buy-btn-label">{busy === way ? (way === 'paypal' ? 'Opening PayPal' : 'Opening secure checkout') : way === 'paypal' ? 'Pay with PayPal' : payWays().length > 1 ? 'Pay by card' : 'Checkout'}</span>
                      <span className="buy-btn-icon" aria-hidden="true">{busy === way ? <i className="buy-spin" /> : '→'}</span>
                    </button>
                  ))}
                  <p className="buy-secure">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10.5h12v9.5H6z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
                    <span>{payLine()}</span>
                  </p>
                  <AnimatePresence>
                    {note && (
                      <motion.div className="buy-note" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <p>{note}</p>
                        {brand.email && <a href={`mailto:${brand.email}?subject=${encodeURIComponent('Buying prints')}`}>Email {brand.email} <span aria-hidden="true">→</span></a>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button type="button" className="cart-clear" onClick={cart.clear}>Empty the cart</button>
                </footer>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
