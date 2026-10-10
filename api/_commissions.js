import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, dbReady } from './_db.js'
import { SITE, codeUsed, shapeAddress } from './_orders.js'
import { artistInbox, clean, emailsToArtist, sendMail } from './_users.js'

/* Commissions: a customer asks for a piece, talks it over with the artist, gets a quote, pays it,
   and follows the piece from sketch to delivery (the leading underscore keeps Vercel from serving
   this file; api/commissions.js is the function that uses it).

   Kept in the database's `commissions` collection, one document each:
   { _id: 'c_…', number: 'C-0003-01' (member number, then which commission of theirs it is),
     userId, email, name, title,
     details: { kind, idea, refs: [links], size, budget, due },
     status: requested | discussing | quoted | paid | sketch | inks | colours | delivered | cancelled,
     quote: null | { price, currency, includes, due, ship, at },
     messages: [{ from: 'customer' | 'artist' | 'system', text, links: [], at }],
     unread: { customer: n, artist: n },
     pending: null | { provider, ref, at }   (a checkout opened and not paid yet)
     payment: null | { provider, ref, amount, currency, paidWith, paidAt, test, pi?, captureId?, refunded? },
     address (when it is posted), createdAt, updatedAt } */
export { dbReady }

/* ---------- the choices made for now (easy to change here) ---------- */
export const SETTINGS = {
  upFront: 1, // the share of the price paid before the work starts: 1 is all of it (deposits would come later)
  shipByDefault: false, // the quote form's "Post it to me" switch starts off: a digital piece
  maxLinks: 10, // reference links on one message
  maxMessages: 400, // a thread stops taking messages after this many
  mailQuietHours: 6, // a new message is emailed when the other side has read everything, or after this long
  deliveryCap: 20 * 1024 * 1024, // the finished files sent by email, all together (Gmail takes 25 MB, encoding adds a third)
  deliveryChunk: 3 * 1024 * 1024, // each piece of a file the admin's browser sends (Vercel takes 4.5 MB a request)
}

// what quotes are in: the shop's currency (Shop → Shop settings), AUD unless set
export const currencyNow = () => String((read('content/site/shop.json') || {}).currency || 'aud').toUpperCase()

/* The currencies a quote can be in: ones both Stripe and PayPal take, written in cents (two decimals),
   so the amount charged is exactly the quote. The shop's own currency comes first and is the default. */
export const QUOTE_CURRENCIES = ['AUD', 'NZD', 'USD', 'CAD', 'GBP', 'EUR', 'SGD', 'HKD']
export const quoteCurrencies = () => [...new Set([currencyNow(), ...QUOTE_CURRENCIES])]

export const STATUSES = ['requested', 'discussing', 'quoted', 'paid', 'sketch', 'inks', 'colours', 'delivered', 'complete', 'cancelled']
/* complete: the customer said they received it (only from delivered). Complete or cancelled, the
   conversation is closed: neither side can write in it any more. */
export const isClosed = (c) => c.status === 'complete' || c.status === 'cancelled'
export const WORK_STAGES = ['sketch', 'inks', 'colours', 'delivered', 'cancelled'] // what the admin moves it to once paid
/* What the piece goes through, set on the quote (quote.stages): a sketch is sketched and delivered,
   an inked piece is inked too, full colour (and anything bigger) gets its colours. A quote from
   before this goes through all of them. */
export const STAGE_SETS = { sketch: ['sketch', 'delivered'], inks: ['sketch', 'inks', 'delivered'], full: ['sketch', 'inks', 'colours', 'delivered'] }
// set on the quote; until there is one (or on a quote from before), what the kind of piece asked for
// goes through: an inked piece never shows colours, a sketch neither inks nor colours
export const stagesOf = (c) => STAGE_SETS[(c && c.quote && c.quote.stages) || guessStages(c && c.details && c.details.kind)] || STAGE_SETS.full
// the likely one for a kind of piece, from the offer's name and what it includes: colour, ink, sketch or pencil
export const guessStages = (kind) => {
  const tier = ((read('content/pages/commissions.json') || {}).tiers || []).find((t) => t && String(t.name || '').trim() === String(kind || '').trim()) || {}
  const words = [kind, tier.text, ...(Array.isArray(tier.includes) ? tier.includes : [])].join(' ').toLowerCase()
  if (/colou?r/.test(words)) return 'full'
  if (/\bink/.test(words)) return 'inks'
  if (/sketch|pencil/.test(words)) return 'sketch'
  return 'full'
}
export const STATUS_WORDS = { requested: 'Requested', discussing: 'Discussing', quoted: 'Quoted', paid: 'Paid', sketch: 'Sketch', inks: 'Inks', colours: 'Colours', delivered: 'Delivered', complete: 'Complete', cancelled: 'Cancelled' }
const OPEN = ['requested', 'discussing', 'quoted'] // not paid yet: the customer can still cancel
export const isOpen = (c) => OPEN.includes(c.status)
/* The commissions that count toward rewards ('A number of commissions'), kept apart from the shop's
   orders and pieces: paid (paid, sketch, inks, colours, delivered), not refunded, and still in the
   customer's account. As with shop orders, one the customer removed from their account no longer
   counts. */
export const COUNTED = ['paid', 'sketch', 'inks', 'colours', 'delivered', 'complete']
export const countedMatch = (userId) => ({ userId, status: { $in: COUNTED }, 'payment.refunded': { $ne: true }, customerRemoved: { $ne: true } })
export const counts = (c) => COUNTED.includes(c.status) && !(c.payment && c.payment.refunded) && !c.customerRemoved
export const isPaid = (c) => Boolean(c && c.payment && c.payment.paidAt)

const read = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }
export const shopSettings = () => read('content/site/shop.json') || {}
// the kinds of piece offered on the Commissions page, and anything else
export const kinds = () => [...((read('content/pages/commissions.json') || {}).tiers || []).map((t) => String((t && t.name) || '').trim()).filter(Boolean), 'Something else']
/* New requests only while commissions are open (Page text → Commissions → Commissions are open).
   Commissions already asked for carry on either way: messages, paying a quote, the stages. */
export const commissionsOpen = () => {
  return (read('content/pages/commissions.json') || {}).open !== false
}
/* The request form can be switched off on its own (Site → Show / hide → Commissions → Request form):
   then no new requests either, whatever the page says. */
export const requestsOn = () => (((read('content/site/visibility.json') || {}).commissions || {}).request !== false)
const brandName = () => (read('content/site/brand.json') || {}).name || 'JBeatsArt'
// the artist's first name, for the words in emails and notes ("Jordan wrote…")
export const artistName = () => String((read('content/site/brand.json') || {}).artist || brandName()).trim().split(/\s+/)[0]

/* ---------- tidying what comes in ---------- */
const text = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max)
// a link someone typed: "www.x.com/y" becomes https://www.x.com/y; anything else that is not a web address is dropped
const asLink = (v) => {
  let s = String(v || '').trim().replace(/[),.;]+$/, '')
  if (/^www\./i.test(s)) s = `https://${s}`
  if (!/^https?:\/\/[^\s<>"]{3,}$/i.test(s) || s.length > 500) return ''
  try { return new URL(s).href } catch { return '' }
}
// links from a list, or found in a line of text, without repeats
export const cleanLinks = (v) => {
  const raw = Array.isArray(v) ? v : String(v || '').split(/[\s,]+/)
  return [...new Set(raw.map(asLink).filter(Boolean))].slice(0, SETTINGS.maxLinks)
}
export const cleanText = (v, max = 4000) => text(v, max)
const pad = (n, w) => String(n).padStart(w, '0')
const after = (got) => (got && got.value !== undefined && got.ok !== undefined ? got.value : got) // older drivers wrap the document

/* ---------- money ---------- */
// money as written here; a currency other than the shop's says which ("$180 USD"), since many share the $ sign
export const price = (n, cur = currencyNow()) => { const code = String(cur || currencyNow()).toUpperCase(); try { const s = new Intl.NumberFormat('en-AU', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n) || 0); return code === currencyNow() ? s : `${s} ${code}` } catch { return `${n} ${code}` } }
export const cents = (n) => Math.round((Number(n) || 0) * 100)
// a date as 2026-12-01 is that day wherever the server is (read and written in UTC)
export const dueWords = (d) => { if (!d) return ''; const t = new Date(d); return Number.isNaN(+t) ? String(d) : t.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }
const addressWords = (a) => (a ? [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ') : '')

/* ---------- the documents ---------- */
export const col = async () => (await db()).collection('commissions')
// the member's next commission number: member 3's first is C-0003-01
export const nextNumber = async (user) => {
  const doc = after(await (await db()).collection('users').findOneAndUpdate({ _id: user._id }, { $inc: { commissionSeq: 1 } }, { returnDocument: 'after' }))
  return `C-${pad(Number(user.memberNo) || 0, 4)}-${pad((doc && doc.commissionSeq) || 1, 2)}`
}
export const message = (from, textValue, links = []) => ({ from, text: text(textValue, 4000), links: cleanLinks(links), at: new Date() })
// the title, when none is given: the start of the idea
export const titleFrom = (kind, idea) => {
  const first = String(idea || '').split(/[.!?\n]/)[0].trim()
  const t = first.length > 60 ? `${first.slice(0, 57).replace(/\s+\S*$/, '')}…` : first
  return t || kind || 'A commission'
}

// a list row, for either side
const lastOf = (c) => (Array.isArray(c.messages) && c.messages.length ? c.messages[c.messages.length - 1] : null)
const summary = (c) => {
  const last = lastOf(c)
  return {
    id: c._id, number: c.number, title: c.title, kind: (c.details && c.details.kind) || '', status: c.status,
    price: c.quote ? c.quote.price : null, currency: (c.quote && c.quote.currency) || currencyNow(), ship: Boolean(c.quote && c.quote.ship),
    stages: stagesOf(c), counted: counts(c), removed: Boolean(c.customerRemoved),
    paidWith: c.payment && c.payment.paidAt ? c.payment.paidWith || (c.payment.provider === 'paypal' ? 'PayPal' : 'Card') : '', completedAt: c.completedAt || null,
    paid: isPaid(c), createdAt: c.createdAt, updatedAt: c.updatedAt,
    lastAt: last ? last.at : c.createdAt, lastFrom: last ? last.from : '', lastText: last ? String(last.text || '').slice(0, 140) : '',
  }
}
// the payment as the customer sees it (no ids)
const paymentFor = (p) => (p && p.paidAt ? { provider: p.provider, amount: p.amount, currency: p.currency, paidWith: p.paidWith || '', paidAt: p.paidAt, refunded: Boolean(p.refunded), ...(p.code ? { code: p.code, discount: p.discount || 0 } : {}) } : null)
export const forCustomer = (c, full = false) => ({
  ...summary(c),
  unread: (c.unread && c.unread.customer) || 0,
  ...(full ? { details: c.details || {}, quote: c.quote || null, messages: c.messages || [], payment: paymentFor(c.payment), address: c.address || null, paying: Boolean(c.pending) } : {}),
})
export const forAdmin = (c, full = false) => ({
  ...summary(c),
  unread: (c.unread && c.unread.artist) || 0,
  userId: c.userId || null, email: c.email || '', name: c.name || '', test: Boolean(c.payment && c.payment.test),
  ...(full ? { details: c.details || {}, quote: c.quote || null, messages: c.messages || [], payment: c.payment || null, pending: c.pending || null, address: c.address || null, suggestedStages: guessStages(c.details && c.details.kind) } : {}),
})

/* ---------- adding to the thread ----------
   Each message (or system note) goes on the end; the side it is for has one more unread. `quiet`
   says whether the other side was already told and has not read since (then no new email). */
export const addMessage = async (id, msg, { set = {}, forSide, alsoUnread } = {}) => {
  const c = await col()
  const before = await c.findOne({ _id: id })
  if (!before) return { before: null, after: null, quiet: false }
  const inc = {}
  if (forSide) inc[`unread.${forSide}`] = 1
  if (alsoUnread) inc[`unread.${alsoUnread}`] = 1
  await c.updateOne({ _id: id }, { $push: { messages: msg }, $set: { ...set, updatedAt: new Date() }, ...(Object.keys(inc).length ? { $inc: inc } : {}) })
  const unreadBefore = forSide ? (before.unread && before.unread[forSide]) || 0 : 0
  const lastMail = forSide && before.mailed && before.mailed[forSide] ? new Date(before.mailed[forSide]) : null
  const quiet = unreadBefore > 0 && lastMail && Date.now() - +lastMail < SETTINGS.mailQuietHours * 3600e3
  return { before, after: await c.findOne({ _id: id }), quiet }
}
export const noteMailed = async (id, side) => (await col()).updateOne({ _id: id }, { $set: { [`mailed.${side}`]: new Date() } })

/* ---------- emails ---------- */
const adminLink = (site, id) => `${site}/admin/#/commissions?c=${encodeURIComponent(id)}`
const accountLink = (site, id) => `${site}/account?tab=orders&view=commissions&c=${encodeURIComponent(id)}`
const firstName = (c) => String(c.name || '').split(' ')[0]
const paras = (t) => String(t || '').split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean)
const safely = async (what, mail) => { try { return await sendMail(mail) } catch (e) { console.error(`${what} email not sent:`, e.message); return false } }

export const mailArtistRequest = (c, site) => (!emailsToArtist('commissions') ? Promise.resolve(false) : safely('commission request', {
  to: artistInbox(),
  subject: `Commission request ${c.number}: ${c.details.kind || 'a piece'} for ${c.name || c.email}`,
  kicker: 'Commission request',
  title: `${c.details.kind || 'A commission'} for ${c.name || c.email}`,
  lines: [
    `From ${c.name || 'a member'} (${c.email}), commission ${c.number}.`,
    ...paras(c.details.idea),
    `Reference pictures: ${c.details.refs && c.details.refs.length ? c.details.refs.join(' ') : 'none yet'}`,
    ...(c.details.size ? [`Size: ${c.details.size}`] : []),
    ...(c.details.budget ? [`Budget: ${c.details.budget}`] : []),
    `Needed by: ${c.details.due || 'no deadline'}`,
  ],
  button: { label: 'Open the commission', url: adminLink(site, c._id) },
  after: 'Answer in the admin (Orders → Commissions): they see it in their account, and get an email.',
  replyTo: c.email ? `${String(c.name || '').replace(/[<>"]/g, '')} <${c.email}>` : undefined,
}))
export const mailArtistMessage = (c, msg, site, what = 'A new message') => (!emailsToArtist('replies') ? Promise.resolve(false) : safely('commission message', {
  to: artistInbox(),
  subject: `${what} on commission ${c.number}${c.name ? ` from ${c.name}` : ''}`,
  kicker: `Commission ${c.number}`,
  title: what,
  lines: [`${c.name || c.email} wrote about "${c.title}":`, ...paras(msg.text), ...(msg.links && msg.links.length ? [`Links: ${msg.links.join(' ')}`] : [])],
  button: { label: 'Open the commission', url: adminLink(site, c._id) },
}))
export const mailCustomer = (c, site, { subject, kicker, title, lines, orders, label = 'See your commission', attachments }) => safely('commission', {
  to: c.email,
  subject,
  kicker: kicker || `Commission ${c.number}`,
  title,
  lines: [`Hi${firstName(c) ? ` ${firstName(c)}` : ''},`, ...lines],
  orders,
  attachments,
  button: { label, url: accountLink(site, c._id) },
  after: 'You can answer from your account, or just reply to this email.',
  replyTo: artistInbox() || undefined,
})
export const quoteBox = (c) => ({
  title: `Commission ${c.number}`,
  sub: c.title,
  rows: [
    ['What is included', c.quote.includes || '—'],
    ...(c.quote.due ? [['Ready by', dueWords(c.quote.due)]] : []),
    ['Delivery', c.quote.ship ? 'Posted to you' : 'Digital'],
    ['Stages', stagesOf(c).map((k) => STATUS_WORDS[k]).join(' → ')],
  ],
  total: price(c.quote.price, c.quote.currency),
})

/* A commission written out for the copy emailed before it leaves the customer's account: the
   request, the quote, the payment, how far it got, and the conversation. Long words go on the left
   (they wrap); amounts on the right. */
const day = (d) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
export const copyBox = (c) => {
  const d = c.details || {}
  const q = c.quote
  const p = c.payment && c.payment.paidAt ? c.payment : null
  const cut = (t, n = 600) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s }
  const rows = [
    [`Asked ${day(c.createdAt)}: ${d.kind || 'a piece'}`, ''],
    [`The idea: ${cut(d.idea)}`, ''],
    ...(d.refs && d.refs.length ? [[`References: ${d.refs.join(' ')}`, '']] : []),
    ...(d.size ? [[`Size: ${d.size}`, '']] : []),
    ...(d.budget ? [[`Budget: ${d.budget}`, '']] : []),
    ...(d.due ? [[`Needed by: ${d.due}`, '']] : []),
    ...(q ? [
      ['Quote', price(q.price, q.currency)],
      [`Included: ${cut(q.includes, 300)}`, ''],
      ...(q.due ? [[`Ready by ${dueWords(q.due)}`, '']] : []),
      [`${q.ship ? 'Posted' : 'Digital'} · ${stagesOf(c).map((k) => STATUS_WORDS[k]).join(' → ')}`, ''],
    ] : [['No quote was sent', '']]),
    ...(p ? [
      ...(p.code ? [[`Code ${p.code}`, `−${price(p.discount || 0, p.currency)}`]] : []),
      [`Paid ${day(p.paidAt)}${p.paidWith ? ` by ${p.paidWith}` : ''}${p.refunded ? ' (refunded)' : ''}`, price(p.amount, p.currency)],
    ] : []),
    [`Stage reached: ${STATUS_WORDS[c.status] || c.status}`, ''],
    ['The conversation', ''],
    ...(c.messages || []).map((m) => [`${day(m.at)}, ${m.from === 'customer' ? 'you' : m.from === 'artist' ? artistName() : 'note'}: ${cut(m.text, 800)}${m.links && m.links.length ? ` ${m.links.join(' ')}` : ''}`, '']),
  ]
  return { title: `Commission ${c.number}`, sub: [c.title, STATUS_WORDS[c.status]].filter(Boolean).join(' · '), rows, total: p ? price(p.amount, p.currency) : q ? price(q.price, q.currency) : '' }
}

// the customer has it (their "I've received it"): the artist hears of it, unless switched off
export const mailArtistReceived = (c, site) => (!emailsToArtist('commissions') ? Promise.resolve(false) : safely('commission received', {
  to: artistInbox(),
  subject: `Commission ${c.number} received by ${c.name || c.email}`,
  kicker: `Commission ${c.number}`,
  title: 'Received: complete',
  lines: [`${c.name || c.email} confirmed they have received "${c.title}". The commission is complete and its conversation is closed.`],
  button: { label: 'Open the commission', url: adminLink(site, c._id) },
}))

/* ---------- paid ----------
   A payment taken (Stripe's webhook, or PayPal's capture): the commission is marked paid, once,
   however often it is reported, with a note in the thread; the customer gets a receipt and the
   artist hears of it. `payment` is { provider, ref, amount, currency, paidWith, test, pi?, captureId? }. */
export const markPaid = async (id, payment, address, site) => {
  if (!dbReady()) return null
  const c = await col()
  const now = new Date()
  const note = message('system', `Paid ${price(payment.amount, payment.currency)}${payment.paidWith ? ` by ${payment.paidWith}` : ''}${payment.code ? ` with the code ${payment.code} (−${price(payment.discount || 0, payment.currency)})` : ''}. Thank you: the work starts now.`)
  const got = after(await c.findOneAndUpdate(
    { _id: id, 'payment.paidAt': { $exists: false } },
    { $set: { status: 'paid', payment: { ...payment, paidAt: now }, pending: null, adminRemoved: false, ...(address ? { address } : {}), updatedAt: now }, $push: { messages: note }, $inc: { 'unread.customer': 1, 'unread.artist': 1 } },
    { returnDocument: 'after' },
  ))
  if (!got) return null // already paid (Stripe says so more than once)
  // a discount code: a reward or a gift shows as used in their account; a PayPal use is counted here (Stripe counts its own)
  if (payment.code) { try { await codeUsed({ code: payment.code, promoId: payment.promoId, viaPaypal: payment.provider === 'paypal', userId: got.userId, ref: payment.ref }) } catch (e) { console.error('code use not noted:', e.message) } }
  const base = quoteBox(got)
  const box = {
    ...base,
    rows: [...base.rows, ...(payment.code ? [[`Code ${payment.code}`, `−${price(payment.discount || 0, payment.currency)}`]] : [])],
    total: price(payment.amount, payment.currency),
    foot: [`Paid by ${payment.paidWith || (payment.provider === 'paypal' ? 'PayPal' : 'card')}`, address ? `Posting to ${addressWords(address)}` : ''].filter(Boolean).join(' · '),
  }
  await mailCustomer(got, site, {
    subject: `Your ${brandName()} commission ${got.number} is paid`,
    kicker: 'Thank you',
    title: `Commission ${got.number} paid`,
    lines: [`Thank you, your payment is in and the work can start. You can follow every stage in your account: ${stagesOf(got).map((k) => STATUS_WORDS[k].toLowerCase()).join(', then ')}.`],
    orders: [box],
    label: 'Follow your commission',
  })
  if (emailsToArtist('commissions')) await safely('commission paid', {
    to: process.env.ORDER_EMAIL_TO || artistInbox(),
    subject: `Commission paid ${got.number}: ${price(payment.amount, payment.currency)}${got.name ? ` from ${got.name}` : ''}${payment.test ? ' (test)' : ''}`,
    kicker: 'Commission paid',
    title: `${price(payment.amount, payment.currency)} paid`,
    lines: [`${got.name || got.email} (${got.email}) paid for "${got.title}"${payment.paidWith ? ` by ${payment.paidWith}` : ''}${payment.test ? ' (a test)' : ''}.`, ...(payment.code ? [`Discount code ${payment.code}: −${price(payment.discount || 0, payment.currency)}`] : []), ...(address ? [`Post to: ${addressWords(address)}`] : ['Delivery: digital.'])],
    button: { label: 'Open the commission', url: adminLink(site, got._id) },
    after: 'Move it on to Sketch, Inks, Colours and Delivered in the admin (Orders → Commissions): they see each step in their account.',
  })
  return got
}

/* A Stripe checkout for a commission, completed (api/stripe-webhook.js): its payment details, then markPaid. */
export const ofStripe = (session) => Boolean(session && session.metadata && session.metadata.site === SITE && session.metadata.kind === 'commission')
export const paidByStripe = async (o, { paidWith, pi, site }) => {
  const id = String(o.metadata.commission || '')
  if (!/^c_[a-f0-9]{24}$/.test(id)) return null
  const ship = (o.collected_information && o.collected_information.shipping_details) || o.shipping_details || null
  return markPaid(id, {
    provider: 'stripe', ref: o.id, pi: pi || '', amount: (o.amount_total || 0) / 100, currency: String(o.currency || currencyNow()).toUpperCase(),
    paidWith: paidWith || 'Card', test: !o.livemode,
    ...(o.metadata.code ? { code: String(o.metadata.code).toUpperCase(), discount: ((o.total_details && o.total_details.amount_discount) || 0) / 100 } : {}),
  }, ship && ship.address ? shapeAddress(ship.address, ship.name) : null, site)
}
// a refund in Stripe (charge.refunded): the payment shows as refunded, with a note in the thread
export const refundedByStripe = async (pi) => {
  if (!dbReady() || !pi) return
  const c = await col()
  const found = await c.findOne({ 'payment.pi': pi })
  if (!found || found.payment.refunded) return
  await c.updateOne({ _id: found._id }, { $set: { 'payment.refunded': true, updatedAt: new Date() }, $push: { messages: message('system', 'The payment was refunded.') }, $inc: { 'unread.customer': 1 } })
}

/* ---------- PayPal (the same keys and live switch as api/checkout.js: PAYPAL_MODE=live) ---------- */
const paypalApi = () => (process.env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')
export const paypalSandbox = () => process.env.PAYPAL_MODE !== 'live'
const paypalToken = async () => {
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const r = await fetch(`${paypalApi()}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
  const said = await r.json().catch(() => ({}))
  if (!r.ok || !said.access_token) throw Object.assign(new Error(`paypal token ${r.status}`), { status: r.status === 401 ? 401 : 502 })
  return said.access_token
}
export const paypal = async (path, body) => {
  const r = await fetch(`${paypalApi()}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${await paypalToken()}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body || {}) })
  const said = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(`paypal ${path} ${r.status} ${(said.details && said.details[0] && said.details[0].issue) || said.name || ''}`), { status: r.status, issue: said.details && said.details[0] && said.details[0].issue })
  return said
}
// a PayPal capture that went through: the payer's address (when posted), then markPaid
export const paidByPaypal = async (id, orderId, said, site, pending = null) => {
  const unit = (said.purchase_units || [])[0] || {}
  const ship = unit.shipping || {}
  const a = ship.address || null
  const capture = ((unit.payments || {}).captures || [])[0] || {}
  return markPaid(id, {
    provider: 'paypal', ref: `pp_${orderId}`, captureId: capture.id || '', paidWith: 'PayPal', test: paypalSandbox(),
    amount: Number(capture.amount && capture.amount.value) || 0, currency: (capture.amount && capture.amount.currency_code) || currencyNow(),
    ...(pending && pending.code ? { code: pending.code, promoId: pending.promoId || '', discount: pending.discount || 0 } : {}),
  }, a ? shapeAddress({ line1: a.address_line_1, line2: a.address_line_2, city: a.admin_area_2, state: a.admin_area_1, postal_code: a.postal_code, country: a.country_code }, ship.name && ship.name.full_name) : null, site)
}

/* ---------- Stripe ---------- */
export const stripe = async (path, form) => {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: form ? 'POST' : 'GET', headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? form.toString() : undefined })
  const said = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, said }
}
// a checkout opened and not paid (a new quote, or a cancel): closed, so the old price can never be paid
export const closePending = async (c) => {
  const p = c && c.pending
  if (!p) return
  if (p.provider === 'stripe' && /^cs_[A-Za-z0-9_]+$/.test(String(p.ref || '')) && process.env.STRIPE_SECRET_KEY) {
    try { await stripe(`checkout/sessions/${p.ref}/expire`, new URLSearchParams()) } catch (e) { console.error('checkout not closed:', e.message) }
  }
  await (await col()).updateOne({ _id: c._id }, { $set: { pending: null } })
}
