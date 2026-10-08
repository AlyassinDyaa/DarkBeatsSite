import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, dbReady } from './_db.js'
import { codeUsed, ours, paidWithOf, piecesNow, readBought, recordOrder, shapeAddress, stripeCodes, takeFromCart, tellAdmin, withPiece } from './_orders.js'

/* Stripe tells the site here when something happens to a payment, so the order lands in the
   database (and so in the buyer's account) whether or not they come back to the site.

   Set up in Stripe: Developers → Webhooks → Add endpoint → https://<the site>/api/stripe-webhook,
   with the events checkout.session.completed, checkout.session.async_payment_succeeded and
   charge.refunded. Stripe then shows a signing secret (whsec_...): that is STRIPE_WEBHOOK_SECRET.

   Every message is checked against that secret before anything is believed; anything else is
   turned away. The message is read as it arrived (byte for byte), which the check needs. */
const TOLERANCE = 5 * 60

const rawBody = async (req) => {
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) return Buffer.from(req.rawBody)
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export const signedByStripe = (raw, header, secret, now = Math.floor(Date.now() / 1000)) => {
  const parts = String(header || '').split(',').map((p) => p.split('='))
  const t = Number((parts.find(([k]) => k === 't') || [])[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length || Math.abs(now - t) > TOLERANCE) return false
  const want = createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest()
  return sigs.some((s) => { const got = Buffer.from(s, 'hex'); return got.length === want.length && timingSafeEqual(got, want) })
}

const stripe = async (path) => {
  const answer = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } })
  return answer.ok ? answer.json() : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Stripe sends POST.' })
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY || !dbReady()) return res.status(503).json({ message: 'STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY and MONGODB_URI must be set.' })
  const raw = await rawBody(req)
  if (!signedByStripe(raw, req.headers['stripe-signature'], secret)) return res.status(400).json({ message: 'Signature check failed.' })
  let event
  try { event = JSON.parse(raw.toString('utf8')) } catch { return res.status(400).json({ message: 'Not JSON.' }) }

  try {
    const o = event.data && event.data.object
    // a checkout of another site sharing the Stripe account is none of this site's business
    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && o && o.payment_status === 'paid' && ours(o)) {
      const lines = await stripe(`checkout/sessions/${o.id}/line_items?limit=100`)
      const ship = (o.collected_information && o.collected_information.shipping_details) || o.shipping_details || null
      const who = o.customer_details || {}
      const userId = /^u_[a-f0-9]{24}$/.test(String(o.client_reference_id || '')) ? o.client_reference_id : null
      // how it was paid (card brand and last four, or the wallet)
      const piId = typeof o.payment_intent === 'string' ? o.payment_intent : (o.payment_intent && o.payment_intent.id) || ''
      const payment = piId ? await stripe(`payment_intents/${piId}?expand[]=latest_charge`) : null
      const charge = payment && payment.latest_charge && typeof payment.latest_charge === 'object' ? payment.latest_charge : null
      await recordOrder({
        ref: o.id,
        provider: 'stripe',
        kind: o.metadata && o.metadata.order ? 'shop' : o.payment_link ? 'support' : 'other',
        pi: piId,
        paidWith: (charge && paidWithOf(charge.payment_method_details)) || 'Card',
        userId,
        email: String(who.email || '').toLowerCase(),
        name: who.name || (ship && ship.name) || '',
        phone: who.phone || '',
        address: ship && ship.address ? shapeAddress(ship.address, ship.name) : null,
        // each line at its price before any discount (the discount is its own line), with its piece kept on it
        items: lines && Array.isArray(lines.data) ? (() => { const pieces = piecesNow(); return lines.data.map((l) => withPiece({ name: l.description, qty: l.quantity || 1, amount: (l.amount_subtotal ?? l.amount_total ?? 0) / 100 }, pieces)) })() : [],
        amount: (o.amount_total || 0) / 100,
        discount: ((o.total_details && o.total_details.amount_discount) || 0) / 100,
        currency: String(o.currency || '').toUpperCase(),
        summary: (o.metadata && o.metadata.order) || '',
        status: 'paid',
        test: !o.livemode,
        createdAt: new Date((o.created || Date.now() / 1000) * 1000),
      })
      // the admin hears of it by email (once, however often Stripe sends this)
      await tellAdmin(o.id, process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ''))
      // paid: what was bought leaves the buyer's saved cart, even if they never come back to the site
      await takeFromCart(userId, readBought(o.metadata && o.metadata.bought))
      // a discount code on it: a reward code shows as used in its owner's account
      try {
        let usedCode = (o.metadata && o.metadata.code) || ''
        const promo = Array.isArray(o.discounts) && o.discounts.find((x) => x && x.promotion_code)
        if (!usedCode && promo) { const p = await stripeCodes(`promotion_codes/${typeof promo.promotion_code === 'string' ? promo.promotion_code : promo.promotion_code.id}`); usedCode = p.ok ? p.said.code : '' }
        if (usedCode) await codeUsed({ code: String(usedCode).toUpperCase(), viaPaypal: false, userId, ref: o.id })
      } catch (e) { console.error('code use not noted:', e.message) }
    }
    if (event.type === 'charge.refunded' && o && o.payment_intent && o.refunded) {
      await (await db()).collection('orders').updateOne({ pi: o.payment_intent }, { $set: { status: 'refunded', updatedAt: new Date() } })
    }
    return res.status(200).json({ received: true })
  } catch (e) {
    console.error('stripe webhook:', e && e.message)
    return res.status(500).json({ message: 'Could not save it; Stripe will try again.' })
  }
}
