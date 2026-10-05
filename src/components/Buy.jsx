import { useState } from 'react'
import { buyable, money, shop } from '../data/site'

/* The price of a piece and the button that buys it. Shown only while online purchases are
   switched on in the admin and the piece has a price. The button asks the site's own checkout
   function (api/checkout.js) for a Stripe payment page and sends the buyer there; if that
   cannot be done, it says why in a line under the button. */
export default function Buy({ piece }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  if (!buyable(piece)) return null
  const buy = async () => {
    setBusy(true); setNote('')
    try {
      const answer = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: piece.slug }) })
      const said = await answer.json().catch(() => ({}))
      if (answer.ok && said.url) { window.location.href = said.url; return }
      setNote(said.message || 'The checkout did not answer. Try again in a moment.')
    } catch {
      setNote('Could not reach the checkout. Check the connection and try again.')
    }
    setBusy(false)
  }
  return (
    <div className="buy">
      <div className="buy-price">{money(piece.price)}</div>
      {shop.note && <p className="buy-what">{shop.note}</p>}
      <button type="button" className="btn" onClick={buy} disabled={busy}>{busy ? 'Opening the checkout…' : shop.buttonLabel} <span className="arrow">→</span></button>
      {note && <p className="buy-note" role="alert">{note}</p>}
    </div>
  )
}
