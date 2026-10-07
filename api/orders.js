import { configured, goodPass } from './_session.js'

/* The admin's Orders screen. Everything paid through Stripe (prints from the Shop, and support
   through the payment links) is read here, straight from Stripe, for the logged-in admin only.
   Nothing about a buyer is ever written to the site's repository: names, addresses and emails
   stay in Stripe, and so does the tracking the admin adds (it is kept on the payment itself, as
   Stripe "metadata", so it also shows in the Stripe dashboard).

   GET  /api/orders[?after=<id>]  the latest 100 completed checkouts, newest first
   POST /api/orders { id, status, carrier, number, note }  saves the posting details of one

   Needs STRIPE_SECRET_KEY (Vercel project settings), and the admin's login pass like api/gh.js. */
const STATUSES = ['new', 'packed', 'shipped', 'delivered', 'cancelled']
const CARRIERS = ['auspost', 'startrack', 'sendle', 'aramex', 'couriersplease', 'dhl', 'other']
const PAGE = 100

const stripe = async (path, init = {}) => {
  const answer = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
  })
  const said = await answer.json().catch(() => ({}))
  return { ok: answer.ok, status: answer.status, said }
}

const cents = (n) => (Number(n) || 0) / 100
const text = (v, max = 200) => String(v ?? '').trim().slice(0, max)

/* One checkout, as the Orders screen shows it. */
const shape = (s) => {
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null
  const charge = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null
  const meta = (pi && pi.metadata) || {}
  const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null
  const who = s.customer_details || {}
  const kind = s.metadata && s.metadata.order ? 'shop' : s.payment_link ? 'support' : 'other'
  const items = s.line_items && Array.isArray(s.line_items.data)
    ? s.line_items.data.map((l) => ({ name: text(l.description, 300), qty: l.quantity || 1, amount: cents(l.amount_total) }))
    : String((s.metadata && s.metadata.order) || '').split(', ').filter(Boolean).map((name) => ({ name, qty: null, amount: null }))
  const refunded = charge ? cents(charge.amount_refunded) : 0
  return {
    id: s.id,
    created: s.created,
    kind,
    amount: cents(s.amount_total),
    discount: cents(s.total_details && s.total_details.amount_discount),
    currency: String(s.currency || '').toUpperCase(),
    paid: s.payment_status === 'paid',
    refunded,
    fullyRefunded: Boolean(charge && charge.refunded),
    name: text(who.name || (ship && ship.name)),
    email: text(who.email),
    phone: text(who.phone),
    address: ship && ship.address ? { name: text(ship.name), ...Object.fromEntries(['line1', 'line2', 'city', 'state', 'postal_code', 'country'].map((k) => [k, text(ship.address[k])])) } : null,
    items,
    receipt: (charge && charge.receipt_url) || '',
    stripe: pi ? `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}payments/${pi.id}` : '',
    test: !s.livemode,
    track: {
      status: STATUSES.includes(meta.ship_status) ? meta.ship_status : 'new',
      carrier: text(meta.ship_carrier, 40),
      number: text(meta.ship_number, 80),
      note: text(meta.ship_note, 400),
      at: text(meta.ship_updated, 40),
    },
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).json({ message: 'ADMIN_PASSCODE and GITHUB_TOKEN are not set in the Vercel project settings.' })
  const pass = String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, '')
  if (!goodPass(pass)) return res.status(401).json({ message: 'Your login has run out. Sign out of the admin and log in again.' })
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ setup: true, message: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY in the Vercel project settings and orders will show here.' })

  try {
    if (req.method === 'GET') {
      const after = text(new URL(req.url, 'http://x').searchParams.get('after'), 120)
      if (after && !/^cs_[A-Za-z0-9_]+$/.test(after)) return res.status(400).json({ message: 'That is not an order.' })
      const base = `checkout/sessions?limit=${PAGE}&status=complete${after ? `&starting_after=${after}` : ''}&expand[]=data.payment_intent.latest_charge`
      // the lines of each order come along too; should Stripe refuse that, the order's own summary will do
      let got = await stripe(`${base}&expand[]=data.line_items`)
      if (!got.ok && got.status === 400) got = await stripe(base)
      if (!got.ok) {
        console.error('stripe refused the order list:', got.status, got.said && got.said.error && got.said.error.message)
        return res.status(502).json({ message: got.status === 401 ? 'Stripe did not accept the key in STRIPE_SECRET_KEY.' : 'Stripe did not answer. Try again in a moment.' })
      }
      const list = Array.isArray(got.said.data) ? got.said.data : []
      return res.status(200).json({ orders: list.map(shape), more: Boolean(got.said.has_more), next: list.length ? list[list.length - 1].id : null })
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const id = text(body.id, 120)
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ message: 'That is not an order.' })
      const status = STATUSES.includes(body.status) ? body.status : 'new'
      const carrier = CARRIERS.includes(body.carrier) ? body.carrier : ''
      const found = await stripe(`checkout/sessions/${id}`)
      if (!found.ok) return res.status(404).json({ message: 'Stripe does not know that order.' })
      const pi = typeof found.said.payment_intent === 'string' ? found.said.payment_intent : found.said.payment_intent && found.said.payment_intent.id
      if (!pi) return res.status(409).json({ message: 'That order has no payment to keep the details on.' })
      const ask = new URLSearchParams()
      // an empty value takes the detail off again
      ask.set('metadata[ship_status]', status)
      ask.set('metadata[ship_carrier]', carrier)
      ask.set('metadata[ship_number]', text(body.number, 80))
      ask.set('metadata[ship_note]', text(body.note, 400))
      ask.set('metadata[ship_updated]', new Date().toISOString())
      const saved = await stripe(`payment_intents/${pi}`, { method: 'POST', body: ask.toString() })
      if (!saved.ok) {
        console.error('stripe refused the tracking update:', saved.status, saved.said && saved.said.error && saved.said.error.message)
        return res.status(502).json({ message: 'Stripe did not save it. Try again in a moment.' })
      }
      const meta = saved.said.metadata || {}
      return res.status(200).json({ track: { status: meta.ship_status || 'new', carrier: meta.ship_carrier || '', number: meta.ship_number || '', note: meta.ship_note || '', at: meta.ship_updated || '' } })
    }

    return res.status(405).json({ message: 'Read orders with GET, save one with POST.' })
  } catch {
    return res.status(502).json({ message: 'Could not reach Stripe. Try again in a moment.' })
  }
}
