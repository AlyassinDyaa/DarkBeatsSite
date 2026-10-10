import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { same } from './_session.js'
import { artistInbox, clean, cleanSlugs, emailHtml, newId, sendMail, siteUrl, testAddress } from './_users.js'
import { bestPrice, liveSales } from './_sales.js'

/* Emails to many customers at once (Orders → Emails in the admin; a leading underscore keeps
   Vercel from serving this file). api/members.js hands it the admin's actions (after the admin's
   login is checked), and api/account.js the unsubscribe link:

   { action: 'adminMailInfo' }                         what the screen needs: how many people each
        audience reaches, the ready-made templates, the shop's pieces, the conventions, the social
        links, where a test goes, today's count against the daily limit, and past mailings
   { action: 'adminMailPreview', fields, audience }    the email as it will look: { html, subject }
   { action: 'adminMailTest', fields, audience }       one copy to the artist's own inbox
   { action: 'adminMailStart', fields, audience }      a new mailing: the people it goes to are
        fixed now (their ids), nothing is sent yet
   { action: 'adminMailSend', id }                     sends the next few (up to BATCH); the browser
        asks again until it is done, so no request runs for long. Each person is ticked off as
        their email goes, so a stopped or broken-off send carries on where it was, never twice
   { action: 'adminMailEnd', id }                      gives up on the rest of an unfinished one

   The law (GDPR, ePrivacy) lets news go only to those who said yes to it: the "news" audience is
   accounts that ticked "send me news" (marketing) with a confirmed email. "all" is every account
   with a confirmed email, for notices about the service only. Test addresses (example.com...) are
   never counted or sent to. Every email carries the person's first name and a link to stop news
   emails (also in the List-Unsubscribe header, which mail apps show as their own button).

   Gmail lets an account send about 500 emails a day, so the emails these mailings send are
   counted an hour at a time, and sending stops once 450 have gone in the last 24 hours. */
export const BATCH = 20
export const DAILY_CAP = 450
const BUDGET_MS = 25000 // a batch stops early rather than run past this
const LOCK_MS = 90000 // a window that stopped answering lets go of its mailing after this

// sending goes through here, so the tests can stand in for the email server
export const mailer = { send: sendMail }

const readJson = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }
const brand = () => readJson('content/site/brand.json') || {}
const brandName = () => String(brand().name || 'JBeatsArt').trim()

// ---------- who it goes to
export const AUDIENCES = {
  news: 'Everyone who agreed to news',
  all: 'All account holders (service notices only, not marketing)',
}
const audienceOf = (a) => (a === 'all' ? 'all' : 'news')
const wants = (u, audience) => Boolean(u && u.email && u.verified && !testAddress(u.email) && (audience === 'all' || u.marketing === true))
export const recipientsOf = async (d, audience) => {
  const filter = audienceOf(audience) === 'all' ? { verified: true } : { verified: true, marketing: true }
  const list = await d.collection('users').find(filter, { projection: { email: 1, name: 1, verified: 1, marketing: 1, memberNo: 1 } }).sort({ memberNo: 1 }).limit(20000).toArray()
  return list.filter((u) => wants(u, audienceOf(audience)))
}
export const audienceCounts = async (d) => ({ news: (await recipientsOf(d, 'news')).length, all: (await recipientsOf(d, 'all')).length })

// ---------- what can go in one: the shop's pieces, the conventions, the social links
const money = (n, cur) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: String(cur || 'AUD').toUpperCase(), currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n) } catch { return `${n}` } }
// a piece's price as the shop shows it now (sales counted): "€20", or "From €10" with sizes at different prices
const priceText = (p, sales, cur) => {
  const own = (v) => (p.status === 'sale' ? Number(v) || 0 : 0)
  const rows = (Array.isArray(p.sizes) ? p.sizes : []).filter((r) => r && String(r.name || '').trim() && Number(r.price) > 0)
  const prices = rows.length ? rows.map((r) => bestPrice(Number(r.price), own(r.salePrice), p, sales).now) : Number(p.price) > 0 ? [bestPrice(Number(p.price), own(p.salePrice), p, sales).now] : []
  if (!prices.length) return ''
  const low = Math.min(...prices)
  return `${new Set(prices).size > 1 ? 'From ' : ''}${money(low, cur)}`
}
export const shopPieces = () => {
  const shop = readJson('content/site/shop.json') || {}
  const sales = liveSales((readJson('content/site/sales.json') || {}).sales)
  let files = []
  try { files = readdirSync(join(process.cwd(), 'content/work')).filter((f) => f.endsWith('.json')) } catch { return [] }
  return files.map((f) => ({ slug: f.slice(0, -5), ...(readJson(`content/work/${f}`) || {}) }))
    .filter((p) => p.title && p.src && !p.hidden && p.status !== 'soldout' && (Number(p.price) > 0 || (Array.isArray(p.sizes) && p.sizes.some((z) => Number(z && z.price) > 0))))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map((p) => ({ slug: p.slug, title: String(p.title), src: String(p.src), price: priceText(p, sales, shop.currency), date: p.date || '' }))
}
export const eventsList = () => {
  let files = []
  try { files = readdirSync(join(process.cwd(), 'content/events')).filter((f) => f.endsWith('.json')) } catch { return [] }
  return files.map((f) => ({ slug: f.slice(0, -5), ...(readJson(`content/events/${f}`) || {}) }))
    .filter((e) => e.name && !e.hidden)
    .sort((a, b) => (Number(a.order) || 10) - (Number(b.order) || 10))
    .map((e) => ({ slug: e.slug, name: String(e.name), when: String(e.when || ''), place: String(e.place || ''), role: String(e.role || ''), url: String(e.url || '') }))
}
const socials = () => (Array.isArray(brand().social) ? brand().social : []).filter((s) => s && /^https?:\/\//.test(String(s.url || ''))).map((s) => ({ label: String(s.label || ''), url: String(s.url) }))
const socialUrl = (re) => (socials().find((s) => re.test(s.label) || re.test(s.url)) || {}).url || ''

/* ---------- the ready-made emails, one per reason, in Jordan's own words. Every field can be
   changed afterwards. In the words, {percent}, {code} and {until} stand for the discount picked,
   {event} for the convention; each line of the text is a paragraph. */
export const TEMPLATES = {
  discount: {
    label: 'New discount', subject: '{percent}% off in the shop, for a little while', kicker: 'Shop news', title: '{percent}% off, on me',
    text: 'I have made a code for you: {percent}% off any print in the shop.\nType it in the cart when you check out. It works until {until}.\nThanks for being here.',
    buttonLabel: 'Visit the shop', buttonUrl: '/shop',
  },
  pieces: {
    label: 'New shop items', subject: 'New prints in the shop', kicker: 'Shop news', title: 'Fresh off the drawing board',
    text: 'A few new prints have just gone into the shop. Here is a first look.\nThanks for following along. It means a lot.',
    buttonLabel: 'See them in the shop', buttonUrl: '/shop',
  },
  instagram: {
    label: 'New Instagram post', subject: 'Something new on my Instagram', kicker: 'Instagram', title: 'New post up',
    text: 'I have just posted something new on Instagram.\nCome and have a look, and tell me what you think.',
    buttonLabel: 'See the post', buttonUrl: '', link: 'instagram',
  },
  youtube: {
    label: 'New YouTube video', subject: 'A new video on my YouTube channel', kicker: 'YouTube', title: 'A new video',
    text: 'I have put a new video up on YouTube.\nGrab a coffee and come and watch.',
    buttonLabel: 'Watch it', buttonUrl: '', link: 'youtube',
  },
  discord: {
    label: 'New on Discord (server or event)', subject: 'Come and say hi on Discord', kicker: 'Discord', title: 'See you on Discord',
    text: 'There is something new on Discord, and I would love to see you there.\nCome and say hi, share what you are drawing, ask me anything.',
    buttonLabel: 'Join on Discord', buttonUrl: '', link: 'discord',
  },
  commissions: {
    label: 'Commissions open', subject: 'My commissions are open', kicker: 'Commissions', title: 'Commissions are open',
    text: 'I am taking commissions again.\nIf there is a character, a villain or a moment you would love to see drawn, now is a good time to ask. Tell me your idea and I will come back to you with a quote.',
    buttonLabel: 'Ask for a quote', buttonUrl: '/commissions#request',
  },
  event: {
    label: 'Convention or event', subject: 'Come and see me at {event}', kicker: 'Out and about', title: 'See you at {event}',
    text: 'I will be at {event}. Come by, say hi, and see the prints in person.\nThe details are below. I would love to meet you.',
    buttonLabel: 'Find out more', buttonUrl: '/',
  },
  news: {
    label: 'General news', subject: 'News from the drawing board', kicker: 'News', title: 'News from the drawing board',
    text: 'A quick note from the drawing board.\nWrite your news here.',
    buttonLabel: 'Visit the site', buttonUrl: '/',
  },
}
const LINKS = { instagram: /instagram/i, youtube: /youtube/i, discord: /discord/i }
// a reason's template as the screen fills it in: the link prefilled from the social links when there is one
export const templateFor = (reason) => {
  const t = TEMPLATES[reason] || TEMPLATES.news
  const { label: _label, link, ...fields } = t
  return { reason: TEMPLATES[reason] ? reason : 'news', ...fields, buttonUrl: link ? socialUrl(LINKS[link]) : fields.buttonUrl, discount: null, pieces: [], event: null }
}

// ---------- the fields as typed in the admin, made safe
const goodUrl = (u) => /^https?:\/\/[^\s<>"]+$/i.test(u) || /^\/[^\s<>"]*$/.test(u)
export const cleanFields = (f) => {
  const x = f && typeof f === 'object' ? f : {}
  const reason = TEMPLATES[x.reason] ? x.reason : 'news'
  const dsc = x.discount && typeof x.discount === 'object' && /^[A-Za-z0-9_-]{2,40}$/.test(String(x.discount.code || '')) ? {
    code: String(x.discount.code).toUpperCase(),
    percent: Math.min(100, Math.max(1, Math.round(Number(x.discount.percent) || 0))) || 10,
    until: Number(x.discount.until) > 0 ? Math.floor(Number(x.discount.until)) : null, // seconds, as Stripe keeps it
  } : null
  const ev = x.event && typeof x.event === 'object' && clean(x.event.name, 120) ? {
    name: clean(x.event.name, 120), when: clean(x.event.when, 80), place: clean(x.event.place, 120), role: clean(x.event.role, 120),
  } : null
  const url = clean(x.buttonUrl, 500)
  return {
    reason,
    subject: clean(x.subject, 150),
    kicker: clean(x.kicker, 40),
    title: clean(x.title, 120),
    text: String(x.text ?? '').replace(/\r/g, '').slice(0, 5000),
    buttonLabel: clean(x.buttonLabel, 60),
    buttonUrl: goodUrl(url) ? url : '',
    discount: dsc,
    pieces: cleanSlugs(x.pieces).slice(0, 4),
    event: ev,
  }
}
// what is missing before it can go
export const fieldsProblem = (f) => {
  if (!f.subject) return 'Write a subject.'
  if (!f.title) return 'Write a heading.'
  if (!f.text.trim()) return 'Write the text.'
  if (f.reason === 'discount' && !f.discount) return 'Pick the discount code.'
  if (f.reason === 'pieces' && !f.pieces.length) return 'Pick at least one piece from the shop.'
  if (f.reason === 'event' && !f.event) return 'Pick the convention, or type its name.'
  if (f.buttonLabel && !f.buttonUrl) return 'The button needs a link: a web address (https://…) or a page of the site (/shop).'
  return ''
}

// ---------- one person's email
const longDate = (ms) => new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
const fill = (t, f) => String(t || '')
  .replace(/\{percent\}/g, f.discount ? String(f.discount.percent) : '…')
  .replace(/\{code\}/g, f.discount ? f.discount.code : '…')
  .replace(/\{until\}/g, f.discount ? (f.discount.until ? longDate(f.discount.until * 1000) : 'further notice') : '…')
  .replace(/\{event\}/g, f.event ? f.event.name : '…')
const absolute = (url, site) => (/^https?:\/\//i.test(url) ? url : `${site}${url}`)
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''
/* The email for one person: { first } is their first name ('' for "Hi there"), unsubscribe the
   link that stops news emails. Ready for sendMail (and emailHtml). */
export const mailFor = (fields, { first = '', unsubscribe = '', site = '', audience = 'news', catalog = null } = {}) => {
  const f = fields
  const pieces = f.pieces.length ? (catalog || shopPieces()).filter((p) => f.pieces.includes(p.slug)).sort((a, b) => f.pieces.indexOf(a.slug) - f.pieces.indexOf(b.slug)) : []
  const name = brandName()
  return {
    subject: fill(f.subject, f),
    kicker: fill(f.kicker, f),
    title: fill(f.title, f),
    lines: [first ? `Hi ${first},` : 'Hi there,', ...fill(f.text, f).split(/\n+/).map((l) => l.trim()).filter(Boolean)],
    code: f.discount ? { label: `${f.discount.percent}% off`, text: f.discount.code, note: [f.discount.until ? `Until ${longDate(f.discount.until * 1000)}` : '', 'type it in the cart'].filter(Boolean).join(' · ') } : null,
    items: pieces.map((p) => ({ src: p.src, title: p.title, text: p.price, url: `${site}/shop` })),
    highlight: f.event ? { label: 'Where and when', title: f.event.name, lines: [f.event.when, f.event.place, f.event.role].filter(Boolean) } : null,
    button: f.buttonLabel && f.buttonUrl ? { label: f.buttonLabel, url: absolute(f.buttonUrl, site) } : null,
    after: audience === 'all' ? `You are getting this because you have an account on the ${name} site.` : `You are getting this because you said yes to news from ${name} on your account.`,
    unsubscribe,
  }
}
export const unsubscribeUrl = (site, user) => `${site}/account/unsubscribe?u=${encodeURIComponent(user._id)}&t=${encodeURIComponent(user.unsubToken)}`

// ---------- the daily count: emails sent by mailings, an hour at a time, the last 24 hours added up
const hourKey = (t) => new Date(t).toISOString().slice(0, 13)
export const sentLastDay = async (d, now = Date.now()) => {
  const keys = Array.from({ length: 24 }, (_, i) => hourKey(now - i * 3600000))
  const rows = await d.collection('mailCounts').find({ _id: { $in: keys } }).toArray()
  return rows.reduce((n, r) => n + (Number(r.n) || 0), 0)
}
const countOne = (d, now = Date.now()) => d.collection('mailCounts').updateOne({ _id: hourKey(now) }, { $inc: { n: 1 }, $setOnInsert: { at: new Date(now) } }, { upsert: true })
const CAPPED = "Gmail's daily limit is near: carry on tomorrow."

// ---------- a mailing as the screen lists it
const summary = (m) => ({
  id: m._id, subject: m.subject, reason: m.reason, audience: m.audience, fields: m.fields, by: m.by || '',
  createdAt: m.createdAt, lastAt: m.lastAt || null, finishedAt: m.finishedAt || null,
  total: m.total || 0, sent: m.sent || 0, failed: m.failed || 0, skipped: m.skipped || 0,
  done: Boolean(m.done), ended: Boolean(m.ended),
})
const history = async (d) => (await d.collection('mailings').find({}, { projection: { ids: 0, sentIds: 0, failedIds: 0, skippedIds: 0, tried: 0 } }).sort({ createdAt: -1 }).limit(60).toArray()).map(summary)

// the next people, after the ones already done; anyone tried but never ticked off was broken off
// mid-send (the window closed, the connection dropped): counted as failed, never sent twice
const settleBroken = async (ml, m) => {
  const done = new Set([...(m.sentIds || []), ...(m.failedIds || []), ...(m.skippedIds || [])])
  const broken = (m.tried || []).filter((id) => !done.has(id))
  for (const id of broken) await ml.updateOne({ _id: m._id }, { $addToSet: { failedIds: id }, $inc: { failed: 1 } })
  return broken.length
}
const leftOf = (m) => {
  const done = new Set([...(m.sentIds || []), ...(m.failedIds || []), ...(m.skippedIds || []), ...(m.tried || [])])
  return (m.ids || []).filter((id) => !done.has(id))
}

/* Sends the next batch of a mailing. Answers [status, body]; body.mailing is where it stands,
   body.capped says the daily limit stopped it. `now` is for the tests. */
export const sendBatch = async (req, d, id, { now = () => Date.now() } = {}) => {
  const ml = d.collection('mailings')
  const users = d.collection('users')
  const started = now()
  // one window at a time sends a mailing; one that stopped answering lets go after a while
  const claim = await ml.updateOne({ _id: id, done: { $ne: true }, $or: [{ lock: { $exists: false } }, { lock: { $lt: started - LOCK_MS } }] }, { $set: { lock: started } })
  if (!claim.matchedCount && !claim.modifiedCount) {
    const m = await ml.findOne({ _id: id })
    if (!m) return [404, { message: 'That mailing is not there any more.' }]
    if (m.done) return [200, { mailing: summary(m), today: { sent: await sentLastDay(d, started), cap: DAILY_CAP } }]
    return [409, { message: 'This mailing is being sent from another window. Wait a moment and try again.', busy: true, mailing: summary(m) }]
  }
  let capped = false
  try {
    let m = await ml.findOne({ _id: id })
    if (await settleBroken(ml, m)) m = await ml.findOne({ _id: id })
    const site = siteUrl(req)
    const fields = cleanFields(m.fields)
    const catalog = shopPieces() // read once for the batch
    for (const uid of leftOf(m).slice(0, BATCH)) {
      if (now() - started > BUDGET_MS) break
      if (await sentLastDay(d, now()) >= DAILY_CAP) { capped = true; break }
      const u = await users.findOne({ _id: uid })
      // gone, or said no to news since it started: left out
      if (!wants(u, m.audience)) { await ml.updateOne({ _id: id }, { $addToSet: { skippedIds: uid }, $inc: { skipped: 1 } }); continue }
      if (!u.unsubToken) { u.unsubToken = randomBytes(16).toString('hex'); await users.updateOne({ _id: uid }, { $set: { unsubToken: u.unsubToken } }) }
      const link = unsubscribeUrl(site, u)
      // ticked as tried before it goes, so a break-off in the middle never sends it again
      await ml.updateOne({ _id: id }, { $addToSet: { tried: uid } })
      let ok = false
      try { ok = await mailer.send({ to: u.email, ...mailFor(fields, { first: firstName(u.name), unsubscribe: link, site, audience: m.audience, catalog }), list: { unsubscribe: link } }) } catch (e) { console.error('mailing email not sent:', e && e.message) }
      if (ok) { await ml.updateOne({ _id: id }, { $addToSet: { sentIds: uid }, $inc: { sent: 1 }, $set: { lastAt: new Date(now()) } }); await countOne(d, now()) }
      else await ml.updateOne({ _id: id }, { $addToSet: { failedIds: uid }, $inc: { failed: 1 }, $set: { lastAt: new Date(now()) } })
    }
    m = await ml.findOne({ _id: id })
    if (!leftOf(m).length) { await ml.updateOne({ _id: id }, { $set: { done: true, finishedAt: new Date(now()) } }); m = { ...m, done: true, finishedAt: new Date(now()) } }
    return [200, { mailing: summary(m), capped, ...(capped ? { message: CAPPED } : {}), today: { sent: await sentLastDay(d, now()), cap: DAILY_CAP } }]
  } finally {
    await ml.updateOne({ _id: id }, { $unset: { lock: '' } })
  }
}

/* ---------- unsubscribing, from the link in an email (no login): the user's id and their token.
   Turns news emails off; they can turn them back on under Details in their account. */
export const unsubscribe = async (d, body) => {
  const u = clean(body && body.u, 80)
  const t = clean(body && body.t, 100)
  const bad = [400, { message: 'This unsubscribe link is not complete. Open it again from the email, or turn news emails off under Details in your account.' }]
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(u) || !/^[a-f0-9]{32}$/.test(t)) return bad
  const users = d.collection('users')
  const user = await users.findOne({ _id: u })
  if (!user || !user.unsubToken || !same(t, user.unsubToken)) return bad
  if (user.marketing !== false || !user.unsubscribedAt) await users.updateOne({ _id: u }, { $set: { marketing: false, unsubscribedAt: new Date() } })
  return [200, { done: true }]
}

// ---------- the admin's actions (api/account.js has checked the admin's pass)
export const mailingAction = async (req, d, action, body) => {
  const audience = audienceOf(body.audience)
  const site = siteUrl(req)
  if (action === 'adminMailInfo') {
    return [200, {
      audiences: Object.entries(AUDIENCES).map(([id, label]) => ({ id, label })),
      counts: await audienceCounts(d),
      templates: Object.fromEntries(Object.keys(TEMPLATES).map((k) => [k, { label: TEMPLATES[k].label, ...templateFor(k) }])),
      pieces: shopPieces(), events: eventsList(), social: socials(),
      testTo: artistInbox() || '', testIsFake: testAddress(artistInbox()),
      today: { sent: await sentLastDay(d), cap: DAILY_CAP }, batch: BATCH,
      mailings: await history(d),
    }]
  }
  if (action === 'adminMailPreview') {
    const f = cleanFields(body.fields)
    const mail = mailFor(f, { first: 'Alex', unsubscribe: `${site}/account?tab=details`, site, audience })
    return [200, { subject: mail.subject, html: emailHtml(mail) }]
  }
  if (action === 'adminMailTest') {
    const f = cleanFields(body.fields)
    const problem = fieldsProblem(f)
    if (problem) return [400, { message: problem }]
    const to = artistInbox()
    if (!to) return [400, { message: 'There is no address to send the test to. Add your email under Site → Brand & contact.' }]
    if (await sentLastDay(d) >= DAILY_CAP) return [429, { message: CAPPED }]
    const mail = mailFor(f, { first: firstName(brand().artist || brandName()), unsubscribe: `${site}/account?tab=details`, site, audience })
    const ok = await mailer.send({ to, ...mail, subject: `[Test] ${mail.subject}` })
    if (!ok) return [502, { message: 'The test could not be sent just now. Try again in a moment.' }]
    if (!testAddress(to)) await countOne(d)
    return [200, { sent: true, to }]
  }
  if (action === 'adminMailStart') {
    const f = cleanFields(body.fields)
    const problem = fieldsProblem(f)
    if (problem) return [400, { message: problem }]
    const people = await recipientsOf(d, audience)
    if (!people.length) return [400, { message: audience === 'news' ? 'Nobody has said yes to news yet, so there is nobody to send it to.' : 'There are no accounts with a confirmed email yet.' }]
    const m = {
      _id: newId('m'), subject: f.subject, reason: f.reason, audience, fields: f, createdAt: new Date(), by: 'admin',
      total: people.length, sent: 0, failed: 0, skipped: 0, done: false,
      ids: people.map((u) => u._id), sentIds: [], failedIds: [], skippedIds: [], tried: [],
    }
    await d.collection('mailings').insertOne(m)
    return [200, { mailing: summary(m), today: { sent: await sentLastDay(d), cap: DAILY_CAP } }]
  }
  if (action === 'adminMailSend') return sendBatch(req, d, clean(body.id, 80))
  if (action === 'adminMailEnd') {
    const id = clean(body.id, 80)
    const ml = d.collection('mailings')
    const m = await ml.findOne({ _id: id })
    if (!m) return [404, { message: 'That mailing is not there any more.' }]
    if (m.lock && m.lock > Date.now() - LOCK_MS) return [409, { message: 'It is being sent right now. Stop it first.' }]
    await ml.updateOne({ _id: id }, { $set: { done: true, ended: true, finishedAt: new Date() } })
    return [200, { mailing: summary({ ...m, done: true, ended: true, finishedAt: new Date() }) }]
  }
  return [400, { message: 'Unknown action.' }]
}
