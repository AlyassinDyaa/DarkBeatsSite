import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* Buying prints. The site sends the cart here as a list of { slug, size, signed, qty } (or a single
   piece as { slug, size, signed }); this function looks each piece up in the site's own content, asks
   Stripe for one checkout page with a line per print, and answers with that page's address.
   The buyer pays on Stripe's page: no card details come near this site.

   Two things keep it honest:
   - every price is read here, from the content this copy of the site was built from, never taken
     from the browser, so a buyer cannot name their own price;
   - Stripe is called with STRIPE_SECRET_KEY, which lives only in the Vercel project settings.
     It is not in the repository and is never sent to the browser.

   Nothing is sold unless "Online purchases" is switched on in the admin (content/site/shop.json)
   and the key is set. vercel.json ships the content folder along with this function. */
const read = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }
const MAX_LINES = 20
const MAX_QTY = 10

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ message: 'Send the cart with POST.' })
  const shop = read('content/site/shop.json') || {}
  if (!shop.enabled) return res.status(403).json({ message: 'Online purchases are switched off at the moment.' })
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return res.status(503).json({ message: 'Online purchase is not set up yet. Get in touch to buy a print.' })

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const asked = Array.isArray(body.items) ? body.items : [{ slug: body.slug, size: body.size, signed: body.signed, qty: 1 }]
  if (!asked.length) return res.status(400).json({ message: 'The cart is empty.' })
  if (asked.length > MAX_LINES) return res.status(400).json({ message: `At most ${MAX_LINES} different prints in one order.` })

  // signed or unsigned: only while the admin offers the choice; the extra for signing is read here too
  const choice = Boolean(shop.signedChoice)
  const lists = read('content/site/categories.json') || {}
  const typeNote = (type) => { const t = (Array.isArray(lists.types) ? lists.types : []).find((x) => x && String(x.name).trim() === String(type || '').trim()); return (t && String(t.note || '').trim()) || '' }
  const extra = Math.max(0, Number(shop.signedExtra) || 0)
  const lines = []
  for (const item of asked) {
    const slug = String((item && item.slug) || '')
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return res.status(400).json({ message: 'Something in the cart is not a piece on this site.' })
    const piece = read(`content/work/${slug}.json`)
    if (!piece || piece.hidden) return res.status(404).json({ message: 'Something in the cart is no longer for sale. Remove it and try again.' })
    if (piece.status === 'soldout') return res.status(409).json({ message: `"${piece.title || slug}" has sold out. Remove it from the cart and try again.` })
    // the piece's own price, or the chosen size's when it comes in sizes; the discount price
    // while the piece is on sale (and it is below the usual price)
    const sizes = (Array.isArray(piece.sizes) ? piece.sizes : []).filter((s) => s && String(s.name || '').trim() && Number(s.price) > 0)
    let size = ''
    let usual = Number(piece.price), sale = Number(piece.salePrice)
    if (sizes.length) {
      const s = sizes.find((x) => String(x.name).trim() === String((item && item.size) || '').trim())
      if (!s) return res.status(409).json({ message: `"${piece.title || slug}" does not come in that size any more. Remove it from the cart and add it again.` })
      size = String(s.name).trim(); usual = Number(s.price); sale = Number(s.salePrice)
    }
    const base = piece.status === 'sale' && sale > 0 && sale < usual ? sale : usual
    const signed = choice ? Boolean(item.signed === true) : null
    const cents = Math.round((base + (signed ? extra : 0)) * 100)
    if (!(cents >= 50)) return res.status(404).json({ message: `"${piece.title || slug}" is not for sale.` })
    const qty = Math.min(MAX_QTY, Math.max(1, Math.round(Number(item.qty) || 1)))
    lines.push({ slug, piece, size, signed, cents, qty })
  }

  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
  const ask = new URLSearchParams()
  ask.set('mode', 'payment')
  ask.set('success_url', `${origin}/shop?thanks=1`)
  ask.set('cancel_url', `${origin}/shop`)
  lines.forEach((l, i) => {
    const at = `line_items[${i}]`
    ask.set(`${at}[quantity]`, String(l.qty))
    ask.set(`${at}[price_data][currency]`, String(shop.currency || 'aud').toLowerCase())
    ask.set(`${at}[price_data][unit_amount]`, String(l.cents))
    ask.set(`${at}[price_data][product_data][name]`, `${String(l.piece.title || l.slug).slice(0, 200)}${l.size ? ` · ${l.size.slice(0, 30)}` : ''}${choice ? (l.signed ? ' (signed)' : ' (unsigned)') : ''}`)
    const what = typeNote(l.piece.type) || shop.note
    if (what) ask.set(`${at}[price_data][product_data][description]`, String(what).slice(0, 500))
    if (typeof l.piece.src === 'string' && l.piece.src.startsWith('/')) ask.set(`${at}[price_data][product_data][images][0]`, origin + l.piece.src)
  })
  // what was ordered, readable in the Stripe dashboard: "venom A2 x2 signed, superman x1"
  ask.set('metadata[order]', lines.map((l) => `${l.slug}${l.size ? ` ${l.size}` : ''} x${l.qty}${choice ? (l.signed ? ' signed' : ' unsigned') : ''}`).join(', ').slice(0, 500))
  if (shop.shipping !== false) {
    const countries = (Array.isArray(shop.countries) ? shop.countries : []).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
    ;(countries.length ? countries : ['AU']).forEach((c, i) => ask.set(`shipping_address_collection[allowed_countries][${i}]`, c))
  }

  try {
    const answer = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: ask.toString(),
    })
    const said = await answer.json().catch(() => ({}))
    if (!answer.ok || !said.url) {
      console.error('stripe refused the checkout:', answer.status, said && said.error && said.error.message) // for the Vercel log; the buyer gets the plain message below
      return res.status(502).json({ message: 'The checkout could not be opened. Try again in a moment.' })
    }
    return res.status(200).json({ url: said.url })
  } catch {
    return res.status(502).json({ message: 'Could not reach the payment service. Try again in a moment.' })
  }
}
