import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { currentUser } from './_users.js'
import { dbReady, recordOrder, shapeAddress } from './_orders.js'
import { db } from './_db.js'

/* Buying prints. The site sends the cart here as a list of { slug, size, signed, qty } (or a single
   piece as { slug, size, signed }), with the way the buyer chose to pay: Stripe or PayPal. This
   function looks each piece up in the site's own content, asks that service for one payment page
   with a line per print, and answers with that page's address. The buyer pays there: no card
   details come near this site.

   Two things keep it honest:
   - every price is read here, from the content this copy of the site was built from, never taken
     from the browser, so a buyer cannot name their own price;
   - the services are called with keys that live only in the Vercel project settings (never in
     the repository, never sent to the browser): STRIPE_SECRET_KEY for Stripe, and
     PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET for PayPal (PAYPAL_MODE=live once it is real; anything
     else uses PayPal's sandbox, for testing).

   PayPal works in two steps: the buyer approves the payment on PayPal and comes back to the Shop,
   which then asks this function to collect it ({ capture: <PayPal order id> }).

   With customer accounts on (Shop & payments → Customer accounts), a logged-in buyer's order is
   tied to their account, so it shows in their order history; with accounts required, nobody
   buys without one.

   Nothing is sold unless "Online purchases" is switched on in the admin (content/site/shop.json),
   the chosen way to pay is one the admin offers (Payment methods), and its keys are set.
   vercel.json ships the content folder along with this function. */
const read = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }
const MAX_LINES = 20
const MAX_QTY = 10

/* the ways to pay the admin offers: "stripe", "paypal" or "both" (Stripe when not set) */
const methods = (shop) => {
  const m = String((shop && shop.payments) || 'stripe')
  return m === 'both' ? ['stripe', 'paypal'] : m === 'paypal' ? ['paypal'] : ['stripe']
}

const paypalBase = () => (process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')
const paypalToken = async () => {
  const answer = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const said = await answer.json().catch(() => ({}))
  if (!answer.ok || !said.access_token) throw new Error(`paypal refused the keys: ${answer.status}`)
  return said.access_token
}
const twoPlaces = (cents) => (cents / 100).toFixed(2)

/* a PayPal payment taken: the order waiting in the database gets the buyer and the address */
const savePaypal = async (id, said) => {
  if (!dbReady()) return
  const unit = (said.purchase_units || [])[0] || {}
  const ship = unit.shipping || {}
  const a = ship.address || null
  const payer = said.payer || {}
  const capture = ((unit.payments || {}).captures || [])[0] || {}
  const before = await (await db()).collection('orders').findOne({ ref: `pp_${id}` })
  await recordOrder({
    ref: `pp_${id}`, provider: 'paypal', paypalId: id, captureId: capture.id || '', status: 'paid',
    email: (before && before.email) || String(payer.email_address || '').toLowerCase(),
    name: (before && before.name) || [payer.name && payer.name.given_name, payer.name && payer.name.surname].filter(Boolean).join(' '),
    address: a ? shapeAddress({ line1: a.address_line_1, line2: a.address_line_2, city: a.admin_area_2, state: a.admin_area_1, postal_code: a.postal_code, country: a.country_code }, ship.name && ship.name.full_name) : null,
    ...(before ? {} : { kind: 'shop', amount: Number(capture.amount && capture.amount.value) || 0, currency: (capture.amount && capture.amount.currency_code) || '', items: [], test: process.env.PAYPAL_MODE !== 'live' }),
  })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ message: 'Send the cart with POST.' })
  const shop = read('content/site/shop.json') || {}
  if (!shop.enabled) return res.status(403).json({ message: 'Online purchases are switched off at the moment.' })
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const ways = methods(shop)
  const accounts = ['optional', 'required'].includes(shop.accounts) ? shop.accounts : 'off'
  // the logged-in customer, so the order lands in their account (never stops a sale if it fails)
  let user = null
  if (accounts !== 'off') { try { user = await currentUser(req) } catch (e) { console.error('account lookup:', e.message) } }

  // ---- PayPal, step two: the buyer approved on PayPal and is back; collect the payment
  if (body.capture) {
    if (!ways.includes('paypal')) return res.status(403).json({ message: 'PayPal is not offered at the moment.' })
    const id = String(body.capture)
    if (!/^[A-Z0-9]{10,40}$/.test(id)) return res.status(400).json({ message: 'That is not a PayPal order.' })
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return res.status(503).json({ message: 'PayPal is not set up yet.' })
    try {
      const token = await paypalToken()
      const answer = await fetch(`${paypalBase()}/v2/checkout/orders/${id}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: '{}' })
      const said = await answer.json().catch(() => ({}))
      const already = Array.isArray(said.details) && said.details.some((d) => d.issue === 'ORDER_ALREADY_CAPTURED')
      if (answer.ok && said.status === 'COMPLETED') {
        try { await savePaypal(id, said) } catch (e) { console.error('paypal order not saved:', e.message) }
        return res.status(200).json({ paid: true })
      }
      if (already) return res.status(200).json({ paid: true })
      console.error('paypal refused the capture:', answer.status, said && (said.name || said.message))
      return res.status(402).json({ message: 'PayPal did not take the payment, so nothing was charged. Try again, or pay another way.' })
    } catch (e) {
      console.error(e.message)
      return res.status(502).json({ message: 'Could not reach PayPal. Nothing was charged. Try again in a moment.' })
    }
  }

  const way = body.provider === 'paypal' ? 'paypal' : body.provider === 'stripe' ? 'stripe' : ways[0]
  if (!ways.includes(way)) return res.status(403).json({ message: `${way === 'paypal' ? 'PayPal' : 'Card payment'} is not offered at the moment.` })
  if (way === 'stripe' && !process.env.STRIPE_SECRET_KEY) return res.status(503).json({ message: 'Online purchase is not set up yet. Get in touch to buy a print.' })
  if (way === 'paypal' && (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)) return res.status(503).json({ message: 'PayPal is not set up yet. Get in touch to buy a print.' })
  if (accounts === 'required' && !user) return res.status(401).json({ login: true, message: 'Log in, or make an account, to buy.' })

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
  const currency = String(shop.currency || 'aud').toLowerCase()
  const brand = String((read('content/site/brand.json') || {}).name || 'Shop')
  const nameOf = (l, max) => `${String(l.piece.title || l.slug).slice(0, max)}${l.size ? ` · ${l.size.slice(0, 30)}` : ''}${choice ? (l.signed ? ' (signed)' : ' (unsigned)') : ''}`
  const whatOf = (l) => typeNote(l.piece.type) || shop.note || ''
  // what was ordered, readable in the dashboards: "venom A2 x2 signed, superman x1"
  const summary = lines.map((l) => `${l.slug}${l.size ? ` ${l.size}` : ''} x${l.qty}${choice ? (l.signed ? ' signed' : ' unsigned') : ''}`).join(', ')

  // ---- PayPal, step one: an order on PayPal, and the page where the buyer approves it
  if (way === 'paypal') {
    const total = lines.reduce((t, l) => t + l.cents * l.qty, 0)
    const code = currency.toUpperCase()
    const order = {
      intent: 'CAPTURE',
      purchase_units: [{
        description: `${brand.slice(0, 60)} order`,
        custom_id: summary.slice(0, 127),
        amount: { currency_code: code, value: twoPlaces(total), breakdown: { item_total: { currency_code: code, value: twoPlaces(total) } } },
        items: lines.map((l) => ({ name: nameOf(l, 90).slice(0, 127), quantity: String(l.qty), unit_amount: { currency_code: code, value: twoPlaces(l.cents) }, category: 'PHYSICAL_GOODS', ...(whatOf(l) ? { description: String(whatOf(l)).slice(0, 127) } : {}) })),
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: brand.slice(0, 127),
        shipping_preference: shop.shipping !== false ? 'GET_FROM_FILE' : 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${origin}/shop?paypal=back`,
        cancel_url: `${origin}/shop`,
      } } },
    }
    try {
      const token = await paypalToken()
      const answer = await fetch(`${paypalBase()}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(order) })
      const said = await answer.json().catch(() => ({}))
      const link = Array.isArray(said.links) && said.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')
      if (!answer.ok || !link) {
        console.error('paypal refused the order:', answer.status, said && (said.name || said.message), JSON.stringify(said.details || []).slice(0, 300))
        return res.status(502).json({ message: 'PayPal could not be opened. Try again in a moment.' })
      }
      // kept as waiting until the buyer comes back and the payment is taken
      try {
        await recordOrder({ ref: `pp_${said.id}`, provider: 'paypal', paypalId: said.id, kind: 'shop', userId: user ? user._id : null, email: user ? user.email : '', name: user ? user.name || '' : '', items: lines.map((l) => ({ name: nameOf(l, 200), qty: l.qty, amount: (l.cents * l.qty) / 100 })), amount: total / 100, discount: 0, currency: code, summary, status: 'pending', test: process.env.PAYPAL_MODE !== 'live' })
      } catch (e) { console.error('paypal order not saved:', e.message) }
      return res.status(200).json({ url: link.href })
    } catch (e) {
      console.error(e.message)
      return res.status(502).json({ message: 'Could not reach PayPal. Try again in a moment.' })
    }
  }

  // ---- Stripe: one checkout page
  const ask = new URLSearchParams()
  ask.set('mode', 'payment')
  ask.set('success_url', `${origin}/shop?thanks=1`)
  ask.set('cancel_url', `${origin}/shop`)
  // a box for a discount code, made in the admin's Discounts screen (Stripe checks the code)
  ask.set('allow_promotion_codes', 'true')
  lines.forEach((l, i) => {
    const at = `line_items[${i}]`
    ask.set(`${at}[quantity]`, String(l.qty))
    ask.set(`${at}[price_data][currency]`, currency)
    ask.set(`${at}[price_data][unit_amount]`, String(l.cents))
    ask.set(`${at}[price_data][product_data][name]`, nameOf(l, 200))
    if (whatOf(l)) ask.set(`${at}[price_data][product_data][description]`, String(whatOf(l)).slice(0, 500))
    if (typeof l.piece.src === 'string' && l.piece.src.startsWith('/')) ask.set(`${at}[price_data][product_data][images][0]`, origin + l.piece.src)
  })
  ask.set('metadata[order]', summary.slice(0, 500))
  // a logged-in buyer: the order is tied to their account (api/stripe-webhook.js reads this back)
  if (user) { ask.set('client_reference_id', user._id); ask.set('customer_email', user.email) }
  if (shop.shipping !== false) {
    const countries = (Array.isArray(shop.countries) ? shop.countries : []).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
    ;(countries.length ? countries : ['AU']).forEach((c, i) => ask.set(`shipping_address_collection[allowed_countries][${i}]`, c))
  }

  try {
    const answer = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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
