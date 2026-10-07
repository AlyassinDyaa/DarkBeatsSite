import { db, dbReady } from './_db.js'

/* Orders in the database. Each is kept under `ref`: the Stripe checkout's id (cs_...) or "pp_"
   and the PayPal order's id. Stripe orders arrive through api/stripe-webhook.js once paid; PayPal
   orders are written when the checkout opens (pending) and filled in when the payment is taken.
   The admin's posting details (packed, shipped, tracking number) are copied here too, which is
   what the customer's account page shows. */
export { dbReady }

const text = (v, max = 200) => String(v ?? '').trim().slice(0, max)
export const shapeAddress = (a, name) => (a ? { name: text(name), line1: text(a.line1), line2: text(a.line2), city: text(a.city), state: text(a.state), postal_code: text(a.postal_code), country: text(a.country, 2) } : null)

/* What was bought, line by line, as [slug, size, signed 1/0]: kept with the checkout so that, once
   the payment is in, those lines leave the buyer's saved cart (and are never paid for twice). */
export const boughtOf = (lines) => lines.map((l) => [l.slug, l.size || '', l.signed ? 1 : 0])
export const readBought = (v) => {
  try { const list = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(list) ? list.filter((b) => Array.isArray(b) && typeof b[0] === 'string').slice(0, 50) : [] } catch { return [] }
}
export const takeFromCart = async (userId, bought) => {
  if (!dbReady() || !userId || !bought.length) return
  const users = (await db()).collection('users')
  const u = await users.findOne({ _id: userId }, { projection: { cart: 1 } })
  if (!u || !Array.isArray(u.cart)) return
  const gone = (l) => bought.some(([slug, size, signed]) => l.slug === slug && (l.size || '') === String(size || '') && Boolean(l.signed) === Boolean(signed))
  const cart = u.cart.filter((l) => !gone(l))
  if (cart.length !== u.cart.length) await users.updateOne({ _id: userId }, { $set: { cart } })
}

// a new order, or more about one (fields already set by the admin, such as tracking, are kept)
export const recordOrder = async (order) => {
  if (!dbReady()) return
  const { track, createdAt, ...rest } = order
  await (await db()).collection('orders').updateOne(
    { ref: order.ref },
    { $set: { ...rest, updatedAt: new Date() }, $setOnInsert: { createdAt: createdAt || new Date(), track: track || { status: 'new', carrier: '', number: '', note: '', at: '' } } },
    { upsert: true },
  )
}

export const setTrack = async (match, track) => {
  if (!dbReady()) return
  await (await db()).collection('orders').updateOne(match, { $set: { track, updatedAt: new Date() } })
}

// tracking links the customer can follow (the same carriers the admin picks from)
const CARRIERS = {
  auspost: ['Australia Post', (n) => `https://auspost.com.au/mypost/track/details/${n}`],
  startrack: ['StarTrack', (n) => `https://startrack.com.au/track/details/${n}`],
  sendle: ['Sendle', (n) => `https://track.sendle.com/tracking?ref=${n}`],
  aramex: ['Aramex', (n) => `https://www.aramex.com.au/tools/track?l=${n}`],
  couriersplease: ['CouriersPlease', (n) => `https://www.couriersplease.com.au/tools-track/no/${n}`],
  dhl: ['DHL', (n) => `https://www.dhl.com/au-en/home/tracking.html?tracking-id=${n}`],
  other: ['Another carrier', null],
}

// one order as its buyer sees it (no admin notes, no payment ids)
export const forCustomer = (o) => {
  const t = o.track || {}
  const c = CARRIERS[t.carrier]
  return {
    number: String(o.ref || '').replace(/^(cs_(test|live)_|pp_)/, '').slice(-8).toUpperCase(),
    createdAt: o.createdAt,
    kind: o.kind || 'shop',
    provider: o.provider,
    status: o.status === 'refunded' ? 'refunded' : o.status === 'pending' ? 'pending' : t.status || 'new',
    items: Array.isArray(o.items) ? o.items.map((i) => ({ name: text(i.name, 200), qty: i.qty || 1, amount: i.amount })) : [],
    amount: o.amount,
    discount: o.discount || 0,
    currency: o.currency || 'AUD',
    address: o.address || null,
    carrier: c ? c[0] : '',
    tracking: t.number || '',
    trackUrl: c && c[1] && t.number ? c[1](encodeURIComponent(t.number)) : '',
    shippedAt: t.status === 'shipped' || t.status === 'delivered' ? t.at || '' : '',
  }
}
