import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* Buying a piece. The site's "Buy" button sends the name of a piece here; this function looks
   the piece up in the site's own content, asks Stripe for a checkout page for it, and answers
   with that page's address. The buyer pays on Stripe's page: no card details come near this site.

   Two things keep it honest:
   - the price is read here, from the content this copy of the site was built from, never taken
     from the browser, so a buyer cannot name their own price;
   - Stripe is called with STRIPE_SECRET_KEY, which lives only in the Vercel project settings.
     It is not in the repository and is never sent to the browser.

   Nothing is sold unless "Online purchases" is switched on in the admin (content/site/shop.json)
   and the key is set. vercel.json ships the content folder along with this function. */
const read = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ message: 'Send the piece with POST.' })
  const shop = read('content/site/shop.json') || {}
  if (!shop.enabled) return res.status(403).json({ message: 'Online purchases are switched off at the moment.' })
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return res.status(503).json({ message: 'Online purchase is not set up yet. Get in touch to buy this piece.' })

  const slug = String((req.body && typeof req.body === 'object' ? req.body.slug : '') || '')
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return res.status(400).json({ message: 'That is not a piece on this site.' })
  const piece = read(`content/work/${slug}.json`)
  if (piece && piece.status === 'soldout') return res.status(409).json({ message: 'This piece has sold out.' })
  // the sale price while the piece is on sale (and it is below the usual price), otherwise the price
  const usual = Number(piece && piece.price), sale = Number(piece && piece.salePrice)
  const base = piece && piece.status === 'sale' && sale > 0 && sale < usual ? sale : usual
  // signed or unsigned: only while the admin offers the choice; the extra for signing is read here too
  const choice = Boolean(shop.signedChoice)
  const signed = choice ? req.body && req.body.signed !== false : null
  const amount = base + (signed ? Math.max(0, Number(shop.signedExtra) || 0) : 0)
  const cents = Math.round(amount * 100)
  if (!piece || piece.hidden || !(cents >= 50)) return res.status(404).json({ message: 'That piece is not for sale.' })

  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
  const ask = new URLSearchParams()
  ask.set('mode', 'payment')
  ask.set('success_url', `${origin}/shop?thanks=1`)
  ask.set('cancel_url', `${origin}/shop`)
  ask.set('line_items[0][quantity]', '1')
  ask.set('line_items[0][price_data][currency]', String(shop.currency || 'aud').toLowerCase())
  ask.set('line_items[0][price_data][unit_amount]', String(cents))
  ask.set('line_items[0][price_data][product_data][name]', `${String(piece.title || slug).slice(0, 230)}${choice ? (signed ? ' (signed)' : ' (unsigned)') : ''}`)
  if (shop.note) ask.set('line_items[0][price_data][product_data][description]', String(shop.note).slice(0, 500))
  if (typeof piece.src === 'string' && piece.src.startsWith('/')) ask.set('line_items[0][price_data][product_data][images][0]', origin + piece.src)
  ask.set('metadata[piece]', slug)
  if (choice) ask.set('metadata[signed]', signed ? 'yes' : 'no')
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
