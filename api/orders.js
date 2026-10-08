import { configured, goodPass } from './_session.js'
import { db, dbReady } from './_db.js'
import { describeItem, numberOrder, ours, paidWithOf, piecesNow, setTrack } from './_orders.js'

/* The admin's Orders screen. Everything paid through Stripe (prints from the Shop, and support
   through the payment links) is read here, straight from Stripe, for the logged-in admin only.
   Nothing about a buyer is ever written to the site's repository: names, addresses and emails
   stay in Stripe, and so does the tracking the admin adds (it is kept on the payment itself, as
   Stripe "metadata", so it also shows in the Stripe dashboard).

   GET  /api/orders[?after=<id>]  the latest 100 completed checkouts, newest first
   POST /api/orders { id, status, carrier, number, note }  saves the posting details of one
   POST /api/orders { action: 'hide', pis: [...], refs: [...] }  deletes orders: they are erased
        from the database (and so from the buyer's account). Stripe cannot delete a payment, so the
        payment is marked (jb_hidden) and the admin no longer lists it.

   With the database set up (MONGODB_URI), PayPal orders are listed here too (they are kept in the
   database: ids start "pp_"), and every posting update is copied to the database, which is what
   the buyer sees in their account.

   Needs STRIPE_SECRET_KEY and/or MONGODB_URI (Vercel project settings), and the admin's login
   pass like api/gh.js. */
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

/* A PayPal order from the database, in the same shape as a Stripe one. */
const shapeSaved = (o) => ({
  id: o.ref,
  orderNo: o.orderNo || '',
  created: Math.floor(new Date(o.createdAt).getTime() / 1000),
  kind: o.kind || 'shop',
  amount: Number(o.amount) || 0,
  discount: Number(o.discount) || 0,
  currency: String(o.currency || '').toUpperCase(),
  paid: true,
  refunded: o.status === 'refunded' ? Number(o.amount) || 0 : 0,
  fullyRefunded: o.status === 'refunded',
  name: text(o.name), email: text(o.email), phone: text(o.phone),
  address: o.address || null,
  items: Array.isArray(o.items) ? o.items.map((i) => ({ name: text(i.name, 300), qty: i.qty || 1, amount: i.amount })) : [],
  receipt: '',
  pi: '',
  provider: 'paypal',
  paidWith: 'PayPal',
  stripe: o.captureId ? `https://www.${o.test ? 'sandbox.' : ''}paypal.com/activity/payment/${o.captureId}` : '',
  test: Boolean(o.test),
  track: { status: 'new', carrier: '', number: '', note: '', at: '', ...(o.track || {}) },
})

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
    paid: s.payment_status === 'paid' || s.payment_status === 'no_payment_required', // a free order (a 100% code) has no payment
    refunded,
    fullyRefunded: Boolean(charge && charge.refunded),
    name: text(who.name || (ship && ship.name)),
    email: text(who.email),
    phone: text(who.phone),
    address: ship && ship.address ? { name: text(ship.name), ...Object.fromEntries(['line1', 'line2', 'city', 'state', 'postal_code', 'country'].map((k) => [k, text(ship.address[k])])) } : null,
    items,
    receipt: (charge && charge.receipt_url) || '',
    paidWith: (charge && paidWithOf(charge.payment_method_details)) || (s.amount_total === 0 ? 'Free, with a code' : 'Card'),
    pi: pi ? pi.id : '',
    hidden: meta.jb_hidden === '1',
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
  const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY)
  if (!hasStripe && !dbReady()) return res.status(503).json({ setup: true, message: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY in the Vercel project settings and orders will show here.' })

  try {
    if (req.method === 'GET') {
      const after = text(new URL(req.url, 'http://x').searchParams.get('after'), 120)
      if (after && !/^cs_[A-Za-z0-9_]+$/.test(after)) return res.status(400).json({ message: 'That is not an order.' })
      let list = []
      let more = false
      if (hasStripe) {
        const base = `checkout/sessions?limit=${PAGE}&status=complete${after ? `&starting_after=${after}` : ''}&expand[]=data.payment_intent.latest_charge`
        // the lines of each order come along too; should Stripe refuse that, the order's own summary will do
        let got = await stripe(`${base}&expand[]=data.line_items`)
        if (!got.ok && got.status === 400) got = await stripe(base)
        if (!got.ok) {
          console.error('stripe refused the order list:', got.status, got.said && got.said.error && got.said.error.message)
          return res.status(502).json({ message: got.status === 401 ? 'Stripe did not accept the key in STRIPE_SECRET_KEY.' : 'Stripe did not answer. Try again in a moment.' })
        }
        list = Array.isArray(got.said.data) ? got.said.data : []
        more = Boolean(got.said.has_more)
      }
      // this site's checkouts only: a Stripe sandbox shared with another site keeps their orders apart
      const orders = list.filter(ours).map(shape).filter((o) => !o.hidden)
      // PayPal orders from the database, with the first page
      if (!after && dbReady()) {
        try {
          const saved = await (await db()).collection('orders').find({ provider: 'paypal', status: { $in: ['paid', 'refunded'] }, hidden: { $ne: true } }).sort({ createdAt: -1 }).limit(300).toArray()
          orders.push(...saved.map(shapeSaved))
          orders.sort((a, b) => b.created - a.created)
        } catch (e) { console.error('paypal orders not read:', e.message) }
      }
      // each line with its piece: picture, size, signed or not, type, category, universe
      const pieces = piecesNow()
      // what the database knows of each order: the pieces it kept when it was paid (for pieces taken off
      // the site since); for a free order (no payment for Stripe to keep details on) its posting, and
      // whether the admin deleted it
      let kept = new Map(), rows = new Map(), gone = new Set()
      if (dbReady()) {
        try {
          const d = await db()
          const found = await d.collection('orders').find({ ref: { $in: orders.map((o) => o.id) } }).toArray()
          rows = new Map(found.map((o) => [o.ref, o]))
          kept = new Map(found.map((o) => [o.ref, o.items || []]))
          gone = new Set((await d.collection('hiddenOrders').find({ ref: { $in: orders.map((o) => o.id) } }).toArray()).map((h) => h.ref))
        } catch (e) { console.error('kept lines not read:', e.message) }
      }
      for (let i = orders.length - 1; i >= 0; i--) if (gone.has(orders[i].id)) orders.splice(i, 1)
      // each order's number (older ones are given theirs now)
      for (const o of orders) {
        const r = rows.get(o.id)
        if (!r) continue
        try { o.orderNo = r.orderNo || (await numberOrder(o.id)) } catch { o.orderNo = '' }
      }
      for (const o of orders) if (!o.pi && o.provider !== 'paypal' && rows.get(o.id) && rows.get(o.id).track) o.track = { ...o.track, ...rows.get(o.id).track }
      for (const o of orders) {
        const saved = kept.get(o.id) || []
        o.items = o.items.map((i, n) => {
          const now = describeItem(i.name, pieces)
          if (now.slug) return { ...i, ...now }
          const k = saved[n] && saved[n].name === i.name ? saved[n] : saved.find((x) => x.name === i.name)
          return k && k.slug ? { ...i, slug: k.slug, title: k.title, src: k.src, size: k.size, signed: k.signed, type: k.type, gone: true } : i
        })
      }
      return res.status(200).json({ orders, more, next: list.length ? list[list.length - 1].id : null })
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      if (body.action === 'hide') {
        const pis = (Array.isArray(body.pis) ? body.pis : []).map((p) => text(p, 80)).filter((p) => /^pi_[A-Za-z0-9_]+$/.test(p))
        const refs = (Array.isArray(body.refs) ? body.refs : []).map((r) => text(r, 80)).filter((r) => /^pp_[A-Z0-9]+$/.test(r) || /^cs_(test|live)_[A-Za-z0-9]+$/.test(r))
        if (!pis.length && !refs.length) return res.status(400).json({ message: 'Between 1 and 100 orders at a time.' })
        if (pis.length + refs.length > 100) return res.status(400).json({ message: 'Between 1 and 100 orders at a time.' })
        const done = []
        for (const pi of hasStripe ? pis : []) {
          const got = await stripe(`payment_intents/${pi}`, { method: 'POST', body: 'metadata[jb_hidden]=1' })
          if (got.ok) done.push(pi)
        }
        // erased from the database, so it leaves the buyer's account too (orders, count, pictures)
        if (done.length && dbReady()) {
          try { await (await db()).collection('orders').deleteMany({ pi: { $in: done } }) } catch (e) { console.error('not erased from the database:', e.message) }
        }
        if (refs.length && dbReady()) {
          const d = await db()
          await d.collection('orders').deleteMany({ ref: { $in: refs } })
          // a Stripe checkout with no payment (a free order) stays in Stripe's list: remembered as deleted here
          for (const ref of refs.filter((r) => r.startsWith('cs_'))) await d.collection('hiddenOrders').updateOne({ ref }, { $setOnInsert: { ref, at: new Date() } }, { upsert: true })
          done.push(...refs)
        }
        return res.status(done.length ? 200 : 502).json({ hidden: done, ...(done.length < pis.length + refs.length ? { message: 'Some could not be removed. Try again in a moment.' } : {}) })
      }
      const id = text(body.id, 120)
      const status = STATUSES.includes(body.status) ? body.status : 'new'
      const carrier = CARRIERS.includes(body.carrier) ? body.carrier : ''
      // a PayPal order: its posting details live in the database only
      if (/^pp_[A-Z0-9]+$/.test(id)) {
        if (!dbReady()) return res.status(503).json({ message: 'The database is not set up.' })
        const track = { status, carrier, number: text(body.number, 80), note: text(body.note, 400), at: new Date().toISOString() }
        await setTrack({ ref: id }, track)
        return res.status(200).json({ track })
      }
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ message: 'That is not an order.' })
      if (!hasStripe) return res.status(503).json({ message: 'Stripe is not connected.' })
      const found = await stripe(`checkout/sessions/${id}`)
      if (!found.ok) return res.status(404).json({ message: 'Stripe does not know that order.' })
      const pi = typeof found.said.payment_intent === 'string' ? found.said.payment_intent : found.said.payment_intent && found.said.payment_intent.id
      if (!pi) {
        // a free order (a 100% code): no payment for Stripe to keep the details on, so the database keeps them
        if (!dbReady()) return res.status(409).json({ message: 'That order has no payment to keep the details on.' })
        const track = { status, carrier, number: text(body.number, 80), note: text(body.note, 400), at: new Date().toISOString() }
        await setTrack({ ref: id }, track)
        return res.status(200).json({ track })
      }
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
      const track = { status: meta.ship_status || 'new', carrier: meta.ship_carrier || '', number: meta.ship_number || '', note: meta.ship_note || '', at: meta.ship_updated || '' }
      // the buyer's account shows it too
      try { await setTrack({ ref: id }, track) } catch (e) { console.error('tracking not copied to the database:', e.message) }
      return res.status(200).json({ track })
    }

    return res.status(405).json({ message: 'Read orders with GET, save one with POST.' })
  } catch {
    return res.status(502).json({ message: 'Could not reach Stripe. Try again in a moment.' })
  }
}
