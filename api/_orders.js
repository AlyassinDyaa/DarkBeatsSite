import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, dbReady } from './_db.js'
import { emailsToArtist, sendMail } from './_users.js'

/* Orders in the database. Each is kept under `ref`: the Stripe checkout's id (cs_...) or "pp_"
   and the PayPal order's id. Stripe orders arrive through api/stripe-webhook.js once paid; PayPal
   orders are written when the checkout opens (pending) and filled in when the payment is taken.
   The admin's posting details (packed, shipped, tracking number) are copied here too, which is
   what the customer's account page shows. */
export { dbReady }

const text = (v, max = 200) => String(v ?? '').trim().slice(0, max)
export const shapeAddress = (a, name) => (a ? { name: text(name), line1: text(a.line1), line2: text(a.line2), city: text(a.city), state: text(a.state), postal_code: text(a.postal_code), country: text(a.country, 2) } : null)

/* This site's Stripe checkouts carry metadata site = SITE, so a Stripe account shared with another
   site (the sandbox used for this site and the Milton Aguiar site while testing) never mixes their
   orders. Checkouts from before the tag (and payment links) carry none, and count as this site's. */
export const SITE = 'jbeatsart'
export const ours = (session) => { const site = session && session.metadata && session.metadata.site; return !site || site === SITE }

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

/* An order line with its piece kept on it (slug, picture, size, signed, type), so the order still
   shows the print after the piece is taken off the site. */
export const withPiece = (item, pieces = piecesNow()) => {
  const d = describeItem(item.name, pieces)
  return d.slug ? { ...item, slug: d.slug, title: d.title, src: d.src, size: d.size, signed: d.signed, type: d.type } : item
}

/* ---------- order numbers
   A member's orders are numbered with their member number and how many orders they have placed:
   JB-0007-03 is member #0007's third order. A guest's order is JB-G- and six letters of its payment.
   The number is given once, when the order is paid, and kept: deleting an order never renumbers
   the others. Orders from before numbers get theirs the first time they are read. */
const refCode = (ref) => String(ref || '').replace(/^(cs_(test|live)_|pp_)/, '').toUpperCase()
export const orderNoOf = (o) => o.orderNo || refCode(o.ref).slice(-8)
const pad = (n, w) => String(Number(n) || 0).padStart(w, '0')
const PAID = ['paid', 'refunded']
const ownerOf = async (d, o) => {
  const users = d.collection('users')
  return (o.userId && (await users.findOne({ _id: o.userId }))) || (o.email && (await users.findOne({ email: o.email, verified: true }))) || null
}
// every order of this member without a number gets the next ones, oldest first
export const numberMember = async (d, user) => {
  if (!user || !user.memberNo) return
  const col = d.collection('orders')
  const match = user.verified ? { $or: [{ userId: user._id }, { email: user.email }] } : { userId: user._id }
  const list = (await col.find({ ...match, status: { $in: PAID }, orderNo: { $exists: false } }).limit(500).toArray())
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  for (const o of list) {
    const got = await d.collection('users').findOneAndUpdate({ _id: user._id }, { $inc: { orderSeq: 1 } }, { returnDocument: 'after' })
    const u = got && got.value !== undefined && got.ok !== undefined ? got.value : got // older drivers wrap the document
    if (!u) return
    await col.updateOne({ ref: o.ref, orderNo: { $exists: false } }, { $set: { orderNo: `JB-${pad(user.memberNo, 4)}-${pad(u.orderSeq, 2)}` } })
  }
}
// one paid order's number (given now if it has none yet)
export const numberOrder = async (ref) => {
  if (!dbReady()) return ''
  const d = await db()
  const col = d.collection('orders')
  const o = await col.findOne({ ref })
  if (!o || o.orderNo || !PAID.includes(o.status)) return o ? orderNoOf(o) : ''
  const owner = await ownerOf(d, o)
  if (owner && owner.memberNo) await numberMember(d, owner)
  else await col.updateOne({ ref, orderNo: { $exists: false } }, { $set: { orderNo: `JB-G-${refCode(ref).slice(-6)}` } })
  const now = await col.findOne({ ref })
  return now ? orderNoOf(now) : ''
}

/* An order as a framed block in an email (what emailHtml's `orders` draws): its number, the date,
   where it stands and how it was paid; each line and its price; the total; where it goes. */
const STAND = { new: 'Being prepared', packed: 'Packed', shipped: 'On its way', delivered: 'Delivered', refunded: 'Refunded', pending: 'Waiting for payment' }
export const priceOf = (n, cur) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur || 'AUD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n) || 0) } catch { return `${n}` } }
export const orderCopy = (raw) => {
  const o = forCustomer(raw)
  const a = o.address
  return {
    title: o.kind === 'support' ? 'Support' : `Order ${o.number}`,
    sub: [new Date(o.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }), STAND[o.status] || 'Paid', o.paidWith].filter(Boolean).join(' · '),
    rows: [...o.items.map((i) => [`${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`, i.amount != null ? priceOf(i.amount, o.currency) : '']), ...(o.discount > 0 ? [['Discount', `−${priceOf(o.discount, o.currency)}`]] : [])],
    total: priceOf(o.amount, o.currency),
    foot: [a ? `Posted to ${[a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ')}.` : '', o.tracking ? `Tracking: ${o.carrier ? `${o.carrier} ` : ''}${o.tracking}` : ''].filter(Boolean).join(' '),
  }
}

/* The buyer's confirmation, once per paid order: their order number, what they bought, the total,
   and (for members) a link to the order in their account. Replies go to the shop. */
export const tellBuyer = async (ref, siteUrl) => {
  if (!dbReady()) return
  const d = await db()
  const col = d.collection('orders')
  const got = await col.findOneAndUpdate({ ref, status: 'paid', buyerTold: { $ne: true }, email: { $nin: ['', null] } }, { $set: { buyerTold: true } })
  const order = got && got.value !== undefined && got.ok !== undefined ? got.value : got
  if (!order) return
  let brand = {}
  try { brand = JSON.parse(readFileSync(join(process.cwd(), 'content/site/brand.json'), 'utf8')) || {} } catch { /* no brand file */ }
  const owner = await ownerOf(d, order)
  const no = orderNoOf(order)
  const support = order.kind === 'support'
  const first = String(order.name || (owner && owner.name) || '').split(' ')[0]
  const site = String(siteUrl || '').replace(/\/$/, '')
  try {
    const sent = await sendMail({
      to: order.email,
      subject: support ? 'Thank you for supporting JBeatsArt' : `Your JBeatsArt order ${no}`,
      kicker: support ? 'Thank you' : 'Order confirmed',
      title: support ? 'Thank you for your support' : `Order ${no}`,
      lines: [
        `Hi${first ? ` ${first}` : ''},`,
        support
          ? 'Your support means a lot. Here is your receipt.'
          : `Thank you for your order. Your order number is ${no}${owner && owner.memberNo ? ` (member #${pad(owner.memberNo, 4)})` : ''}: keep it for any question about this order.`,
        ...(!support ? [owner ? 'Each step shows in your account as it happens: packed, posted, and the tracking number once it is on its way.' : 'We will be in touch once it is posted. Questions? Just reply to this email.'] : []),
      ],
      orders: [orderCopy(order)],
      ...(owner && site ? { button: { label: support ? 'Open your account' : 'See your order', url: `${site}/account` } } : {}),
      after: 'Questions about your order? Just reply to this email.',
      replyTo: brand.email || process.env.CONTACT_TO || undefined,
    })
    if (!sent) await col.updateOne({ ref }, { $unset: { buyerTold: '' } }) // try again the next time Stripe or PayPal says so
  } catch (e) { console.error('buyer email not sent:', e.message); await col.updateOne({ ref }, { $unset: { buyerTold: '' } }) }
}

// a paid order: numbered, then the admin and the buyer each hear of it (once)
export const paidOrder = async (ref, siteUrl) => {
  try { await numberOrder(ref) } catch (e) { console.error('order not numbered:', e.message) }
  await tellAdmin(ref, siteUrl)
  await tellBuyer(ref, siteUrl)
}

/* A paid order, told to the admin by email, once: what was bought, by whom, where it goes. Sent to
   ORDER_EMAIL_TO, else CONTACT_TO, else the email in Site → Brand & contact. */
export const tellAdmin = async (ref, siteUrl) => {
  if (!dbReady()) return
  if (!emailsToArtist('orders')) return // switched off under Shop → Shop settings → Emails to you
  const col = (await db()).collection('orders')
  const o = await col.findOneAndUpdate({ ref, status: 'paid', adminTold: { $ne: true } }, { $set: { adminTold: true } })
  const order = o && o.value !== undefined && o.ok !== undefined ? o.value : o // older drivers wrap the document
  if (!order) return
  let brand = {}
  try { brand = JSON.parse(readFileSync(join(process.cwd(), 'content/site/brand.json'), 'utf8')) || {} } catch { /* no brand file */ }
  const senderOf = String(process.env.MAIL_FROM || '').match(/<([^>]+)>/)
  const to = process.env.ORDER_EMAIL_TO || process.env.CONTACT_TO || brand.email || (senderOf && senderOf[1]) || process.env.SMTP_USER
  if (!to) return
  const cur = order.currency || 'AUD'
  const price = (n) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n) || 0) } catch { return `${n} ${cur}` } }
  const a = order.address
  const items = (order.items || []).map((i) => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}${i.amount != null ? `, ${price(i.amount)}` : ''}`)
  const support = order.kind === 'support'
  try {
    await sendMail({
      to,
      subject: `${support ? 'New support' : `New order ${orderNoOf(order)}`}: ${price(order.amount)}${order.name ? ` from ${order.name}` : ''}${order.test ? ' (test)' : ''}`,
      kicker: support ? 'New support' : `New order ${orderNoOf(order)}`,
      title: `${price(order.amount)} ${support ? 'from a fan' : 'paid'}`,
      lines: [
        `${order.name || 'Someone'}${order.email ? ` (${order.email})` : ''} paid ${price(order.amount)} by ${order.paidWith || (order.provider === 'paypal' ? 'PayPal' : 'card')}${order.test ? ', with test money' : ''}.`,
        ...(items.length ? ['What they bought:', ...items] : []),
        ...(order.discount > 0 ? [`Discount: −${price(order.discount)}${order.code ? ` (code ${order.code})` : ''}`] : []),
        ...(a ? [`Post to: ${[a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ')}`] : []),
        ...(order.phone ? [`Phone: ${order.phone}`] : []),
      ],
      button: { label: 'Open orders', url: `${String(siteUrl || '').replace(/\/$/, '')}/admin/#/orders` },
      after: 'Mark it packed and shipped in Orders: the buyer sees each step, and the tracking number, in their account.',
    })
  } catch (e) { console.error('order email not sent:', e.message) }
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
    number: orderNoOf(o),
    createdAt: o.createdAt,
    kind: o.kind || 'shop',
    provider: o.provider,
    paidWith: paidWithLabel(o),
    status: o.status === 'refunded' ? 'refunded' : o.status === 'pending' ? 'pending' : t.status || 'new',
    items: Array.isArray(o.items) ? o.items.map((i) => ({ name: text(i.name, 200), qty: i.qty || 1, amount: i.amount, slug: i.slug || '', title: i.title || '', src: i.src || '' })) : [],
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

/* ---------- discount codes at the checkout
   Codes are made in Stripe (the admin's Discounts screen, and rewards), so Stripe knows each one:
   its percentage, its end date, how many uses it allows and how many it has had. A buyer types a
   code into the cart: it is checked here, the cart shows the new total, and the payment is taken
   for exactly that (Stripe applies the code to its own page; PayPal is sent the discount). Stripe
   counts its own uses; a use through PayPal is counted in the database (codeUses), and a code that
   has had all its uses is switched off in Stripe. A reward code can only be used by the customer
   it was made for, and once used it shows as used in their account. */
const STRIPE_VERSION = '2024-06-20' // the version api/discounts.js reads promotion codes with
export const stripeCodes = async (path, init = {}) => {
  const answer = await fetch(`https://api.stripe.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_VERSION, ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) } })
  const said = await answer.json().catch(() => ({}))
  return { ok: answer.ok, said }
}
export const tidyCode = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40)
export const codeUsesHere = async (code) => usesHere(code)
const usesHere = async (code) => (dbReady() ? (await db()).collection('codeUses').countDocuments({ code }) : 0)
// the discount a percentage takes off a total in cents, rounded as Stripe rounds it
export const discountCents = (totalCents, percent) => Math.round((totalCents * percent) / 100)
/* Whether a code can be used now, by this buyer: { ok, code, percent, label, promoId, reward } or
   { ok: false, message }. Only codes this site made (metadata jb) count. */
export const checkCode = async (raw, user) => {
  const code = tidyCode(raw)
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) return { ok: false, message: 'That does not look like a discount code.' }
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, message: 'Discount codes cannot be checked right now.' }
  const got = await stripeCodes(`promotion_codes?code=${encodeURIComponent(code)}&limit=5`)
  const p = got.ok && Array.isArray(got.said.data) ? got.said.data.find((x) => x.code.toUpperCase() === code && x.metadata && x.metadata.jb === '1') : null
  const nope = { ok: false, message: 'That code is not valid.' }
  if (!p || p.metadata.jb_hidden === '1') return nope
  const coupon = p.coupon || {}
  const now = Math.floor(Date.now() / 1000)
  if (!p.active || coupon.valid === false) return { ok: false, message: 'That code has been used up or switched off.' }
  if ((p.expires_at && p.expires_at < now) || (coupon.redeem_by && coupon.redeem_by < now)) return { ok: false, message: 'That code has run out.' }
  if (!(coupon.percent_off > 0)) return nope
  if (p.max_redemptions && (p.times_redeemed || 0) + (await usesHere(code)) >= p.max_redemptions) return { ok: false, message: 'That code has been used up.' }
  // a reward is the customer's own: they need to be logged in to that account
  if (p.metadata.reward && p.metadata.email && (!user || user.email !== p.metadata.email)) return { ok: false, message: 'That code is a reward for another account. Log in to the account it was given to.' }
  return { ok: true, code, percent: coupon.percent_off, label: coupon.name || `${coupon.percent_off}% off`, promoId: p.id, max: p.max_redemptions || null, reward: p.metadata.reward || '' }
}
/* A code was used on a paid order. Through PayPal it is counted here (Stripe counts its own), and
   switched off once it has had all its uses. A reward code is marked used in its owner's account. */
export const codeUsed = async ({ code, promoId, viaPaypal, userId, ref }) => {
  if (!code || !dbReady()) return
  const d = await db()
  if (viaPaypal) {
    await d.collection('codeUses').updateOne({ ref }, { $setOnInsert: { ref, code, at: new Date() } }, { upsert: true })
    if (promoId && process.env.STRIPE_SECRET_KEY) {
      const got = await stripeCodes(`promotion_codes/${promoId}`)
      const max = got.ok ? got.said.max_redemptions : null
      if (max && (got.said.times_redeemed || 0) + (await usesHere(code)) >= max) await stripeCodes(`promotion_codes/${promoId}`, { method: 'POST', body: 'active=false' })
    }
  }
  if (userId) {
    const u = await d.collection('users').findOne({ _id: userId })
    const entry = u && u.rewardCodes && Object.entries(u.rewardCodes).find(([, v]) => v && v.code === code)
    if (entry && !entry[1].usedAt) await d.collection('users').updateOne({ _id: userId }, { $set: { [`rewardCodes.${entry[0]}.usedAt`]: new Date().toISOString() } })
    // a code the admin gave them (Discounts): marked used in their Gifts
    if (u && Array.isArray(u.giftCodes) && u.giftCodes.some((g) => g.code === code && !g.usedAt)) {
      await d.collection('users').updateOne({ _id: userId }, { $set: { giftCodes: u.giftCodes.map((g) => (g.code === code && !g.usedAt ? { ...g, usedAt: new Date().toISOString() } : g)) } })
    }
  }
}
