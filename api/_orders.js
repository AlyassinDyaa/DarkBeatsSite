import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/* What an order line is, read back from its name ("The Devils Mark · 8x8 (signed)"): the piece it
   is (the longest title it starts with), its size, signed or not, and the piece's type, category,
   universe and picture from the site's content. Works for every order, old ones too. */
export const piecesNow = () => {
  try {
    const dir = join(process.cwd(), 'content/work')
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
      try { return { slug: f.slice(0, -5), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) } } catch { return null }
    }).filter((p) => p && p.title).sort((a, b) => String(b.title).length - String(a.title).length)
  } catch { return [] }
}
export const describeItem = (name, pieces) => {
  const full = String(name || '')
  const piece = pieces.find((p) => full.startsWith(p.title))
  if (!piece) return {}
  const signedMark = full.match(/\s\((signed|unsigned)\)$/)
  const rest = full.slice(piece.title.length).replace(/\s\((signed|unsigned)\)$/, '')
  const size = rest.startsWith(' · ') ? rest.slice(3).trim() : ''
  return {
    slug: piece.slug, title: piece.title, size,
    signed: signedMark ? signedMark[1] === 'signed' : null,
    type: text(piece.type, 80), category: text(piece.category, 80), universe: text(piece.universe, 80),
    src: typeof piece.src === 'string' && piece.src.startsWith('/') ? piece.src : '',
  }
}

/* How it was paid, in words: "Visa •••• 4242", "Apple Pay · Visa •••• 4242", "PayPal", "Afterpay".
   From a Stripe charge's payment_method_details; PayPal orders simply say PayPal. */
const BRANDS = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay', eftpos_au: 'eftpos' }
const WALLETS = { apple_pay: 'Apple Pay', google_pay: 'Google Pay', samsung_pay: 'Samsung Pay', link: 'Link' }
const words = (k) => String(k || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
export const paidWithOf = (details) => {
  if (!details || !details.type) return ''
  if (details.type === 'card' && details.card) {
    const c = details.card
    const card = `${BRANDS[c.brand] || words(c.brand) || 'Card'}${c.last4 ? ` •••• ${c.last4}` : ''}`
    const wallet = c.wallet && c.wallet.type ? WALLETS[c.wallet.type] || words(c.wallet.type) : ''
    return text(wallet ? `${wallet} · ${card}` : card, 60)
  }
  return text({ afterpay_clearpay: 'Afterpay', au_becs_debit: 'Bank debit', paypal: 'PayPal', link: 'Link' }[details.type] || words(details.type), 60)
}
const paidWithLabel = (o) => o.paidWith || (o.provider === 'paypal' ? 'PayPal' : o.provider === 'stripe' ? 'Card' : '')

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
    paidWith: paidWithLabel(o),
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
