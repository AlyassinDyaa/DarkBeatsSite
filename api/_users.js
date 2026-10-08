import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import nodemailer from 'nodemailer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, dbReady } from './_db.js'

/* What the customer-account functions share (the leading underscore keeps Vercel from serving it).

   - Passwords are kept only as scrypt hashes, each with its own salt.
   - A login is a random session id in an HTTP-only cookie (so page scripts cannot read it); the
     database keeps only a hash of it, so a copy of the database holds no usable logins.
   - Links sent by email (reset a password, confirm an address) are random, used once, and run
     out; again only their hash is kept.
   - Too many wrong passwords, or too many reset emails, and the door closes for a while.
   - Links in emails are built from SITE_URL (or Vercel's own production address), never from the
     address a request claims to come from, so nobody can send out a link to another site. */
export { dbReady }
const scrypt = promisify(scryptCallback)
const KEY = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const SESSION_DAYS = 30
const COOKIE = 'jb_session'

export const sha = (text) => createHash('sha256').update(String(text)).digest('hex')
export const newId = (prefix) => `${prefix}_${randomBytes(12).toString('hex')}`
export const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max)
export const EMAIL = /^[^\s@<>"(),;:]{1,64}@[^\s@<>"(),;:]{1,190}\.[a-z]{2,24}$/i
export const tidyEmail = (v) => clean(v, 254).toLowerCase()

// ---------- passwords
export const passwordProblem = (pw) => {
  const p = String(pw || '')
  if (p.length < 8) return 'Use at least 8 characters for the password.'
  if (p.length > 200) return 'That password is too long.'
  if (/^(.)\1+$/.test(p) || /^(password|12345678|qwertyui)/i.test(p)) return 'Pick a password that is harder to guess.'
  return ''
}
export const hashPassword = async (pw) => {
  const salt = randomBytes(16)
  const key = await scrypt(String(pw).normalize('NFKC'), salt, 64, KEY)
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`
}
// the same work is done when there is no account, so the answer's timing gives nothing away
export const checkPassword = async (pw, stored) => {
  const [tag, salt, key] = String(stored || '').split('$')
  const real = tag === 's1' && salt && key
  const got = await scrypt(String(pw || '').normalize('NFKC'), real ? Buffer.from(salt, 'base64') : Buffer.alloc(16), 64, KEY)
  const want = real ? Buffer.from(key, 'base64') : Buffer.alloc(64)
  return Boolean(real) && want.length === got.length && timingSafeEqual(got, want)
}

// ---------- the request
export const readCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(/;\s*/).filter((c) => c.includes('=')).map((c) => {
  const i = c.indexOf('=')
  try { return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))] } catch { return [c.slice(0, i), ''] }
}))
const onHttps = (req) => process.env.VERCEL === '1' || String(req.headers['x-forwarded-proto'] || '').includes('https')
export const clientIp = (req) => clean(String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0], 60)
// a change must come from the site's own pages: a form on another site cannot use the visitor's login
export const fromThisSite = (req) => {
  const origin = req.headers.origin
  if (!origin) return true // same-origin fetches from older browsers leave it out; the cookie is SameSite=Lax too
  try {
    const host = new URL(origin).host
    return host === req.headers['x-forwarded-host'] || host === req.headers.host
  } catch { return false }
}

// ---------- sessions
const cookieText = (value, seconds, req) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${onHttps(req) ? '; Secure' : ''}`
export const startSession = async (req, res, userId) => {
  const raw = randomBytes(32).toString('base64url')
  await (await db()).collection('sessions').insertOne({ hash: sha(raw), userId, createdAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5), agent: clean(req.headers['user-agent'], 160) })
  res.setHeader('Set-Cookie', cookieText(raw, SESSION_DAYS * 86400, req))
}
export const endSession = async (req, res) => {
  const raw = readCookies(req)[COOKIE]
  if (raw) await (await db()).collection('sessions').deleteOne({ hash: sha(raw) })
  res.setHeader('Set-Cookie', cookieText('', 0, req))
}
export const forgetCookie = (req, res) => res.setHeader('Set-Cookie', cookieText('', 0, req))
// the logged-in customer, or null; `session` is the hash of this login (to keep it when ending the others)
export const currentUser = async (req) => {
  if (!dbReady()) return null
  const raw = readCookies(req)[COOKIE]
  if (!raw || raw.length > 100) return null
  const d = await db()
  const session = await d.collection('sessions').findOne({ hash: sha(raw) })
  if (!session || new Date(session.expiresAt) < new Date()) return null
  const user = await d.collection('users').findOne({ _id: session.userId })
  return user ? { ...user, session: session.hash } : null
}

// ---------- one-time links
export const makeToken = async (userId, kind, minutes) => {
  const raw = randomBytes(32).toString('base64url')
  const d = await db()
  await d.collection('tokens').deleteMany({ userId, kind }) // a new link replaces any older one of the same kind
  await d.collection('tokens').insertOne({ hash: sha(raw), userId, kind, expiresAt: new Date(Date.now() + minutes * 60000) })
  return raw
}
export const spendToken = async (raw, kind) => {
  if (!raw || String(raw).length > 100) return null
  const d = await db()
  const token = await d.collection('tokens').findOne({ hash: sha(raw), kind })
  if (!token) return null
  await d.collection('tokens').deleteOne({ hash: token.hash })
  return new Date(token.expiresAt) < new Date() ? null : token
}

// ---------- too many tries
export const tooMany = async (key, limit, minutes) => (await (await db()).collection('attempts').countDocuments({ key, at: { $gt: new Date(Date.now() - minutes * 60000) } })) >= limit
export const noteTry = async (...keys) => { const d = await db(); for (const key of keys) await d.collection('attempts').insertOne({ key, at: new Date() }) }
export const forgetTries = async (key) => (await db()).collection('attempts').deleteMany({ key })

/* ---------- email: two ways to send, whichever is set up
   - an email account's own sending server (SMTP), for example Gmail with an app password:
     SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), SMTP_USER (the address), SMTP_PASS (the app password).
     Emails then come from that address; handy for testing, and fine for small volumes.
   - Resend (resend.com): RESEND_API_KEY, sending from an address on a domain verified there.
   MAIL_FROM is the sender as people see it ("JBeatsArt <hello@...>"); MAIL_REPLY_TO, if set,
   is where replies go. With neither set, on this computer the email is printed instead.
   An email is { to, subject, kicker, title, lines, button: { label, url }, picture: { src, title, text }, after, replyTo }. */
export const siteUrl = (req) => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL ? '' : `http://${req.headers.host}`)).replace(/\/$/, '')
const smtpReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
export const mailReady = () => smtpReady() || Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
let transport = null
const smtp = () => transport || (transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: (Number(process.env.SMTP_PORT) || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s+/g, '') },
}))
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
// the site's name, tagline and links, from Site → Brand & contact in the admin
const brandInfo = () => { try { return JSON.parse(readFileSync(join(process.cwd(), 'content/site/brand.json'), 'utf8')) || {} } catch { return {} } }
/* Where the pictures in an email are fetched from: the live site (an inbox cannot reach this
   computer), so they show once the site is deployed. */
const LIVE = 'https://jbeatsart.vercel.app'
const assetHost = () => {
  const s = String(process.env.SITE_URL || '').replace(/\/$/, '')
  if (/^https:\/\//.test(s)) return s
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return LIVE
}
const pictureUrl = (path) => (/^https?:\/\//.test(path) ? path : `${assetHost()}${path.startsWith('/') ? '' : '/'}${path}`)

/* Every email in the site's own look: a dark purple band with the logo and the name (the last
   part in the brand purple), a dark panel with a small slanted tag, a big tall heading, the words,
   a picture when there is one, a purple button, the link written out under it, and a quiet footer.
   Built from tables with the styles on each piece, the way email apps need it.
   Staying dark everywhere: the page says it is a dark email (color-scheme), so Apple Mail and
   Outlook leave it alone. Gmail's phone app in dark mode turns light emails dark and dark ones light
   whatever they say, so every dark background is also painted as a background image (which it never
   changes), and the light words sit in two blend layers that turn its flip back (the gmail-* classes,
   which only Gmail ever matches: it puts a <u> before the body). */
const DISPLAY = "Anton, Impact, 'Arial Narrow Bold', 'Helvetica Neue', Arial, sans-serif"
const BODY = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace"
const C = { page: '#09070d', panel: '#15101c', line: '#2c2236', accent: '#c565f8', button: '#a447e0', text: '#e4dcec', soft: '#a397ae', gold: '#ffd34d' }
const paint = (c) => `background-color:${c};background-image:linear-gradient(${c},${c});`
// light words that must stay light in Gmail's dark mode
const keep = (html, tag = 'div') => `<${tag} class="gmail-screen"><${tag} class="gmail-dif">${html}</${tag}></${tag}>`
export const emailHtml = ({ subject, kicker, title, lines = [], button, picture, after, code, orders }) => {
  const b = brandInfo()
  const name = String(b.name || 'JBeatsArt').trim()
  // "JBeatsArt" reads JBEATS + ART, as the site's wordmark does
  const cut = /^(.*?)(Art|ART|art)$/.exec(name)
  const [first, second] = cut && cut[1] ? [cut[1], cut[2]] : [name, '']
  const insta = (Array.isArray(b.social) ? b.social : []).find((x) => /instagram/i.test(x.label || ''))
  // the footer always names the real site, never this computer
  const home = assetHost()
  const para = (t) => `<p style="margin:0 0 14px;font-family:${BODY};font-size:16px;line-height:1.65;color:${C.text};">${keep(esc(t), 'span')}</p>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(subject)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  u + .body .gmail-screen { background:#000; mix-blend-mode:screen; display:inline; }
  u + .body .gmail-dif { background:#000; mix-blend-mode:difference; display:inline; }
  u + .body div.gmail-screen, u + .body div.gmail-dif { display:block; }
  a { text-decoration:none; }
</style></head>
<body class="body" style="margin:0;padding:0;${paint(C.page)}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${paint(C.page)}"><tr><td align="center" style="padding:28px 12px 36px;${paint(C.page)}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
  <tr><td style="background-color:#3d0a57;background-image:linear-gradient(120deg,#540075,#2a0a3d 70%);border:1px solid ${C.line};border-bottom:3px solid ${C.accent};padding:16px 22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;"><img src="${esc(pictureUrl('/email/logo.png'))}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:50%;border:2px solid ${C.accent};${paint(C.page)}"></td>
      <td style="vertical-align:middle;padding-left:12px;font-family:${DISPLAY};font-size:24px;font-weight:400;letter-spacing:1px;text-transform:uppercase;line-height:1;"><span style="color:#ffffff;">${keep(esc(first), 'span')}</span>${second ? `<span style="color:${C.accent};">${esc(second)}</span>` : ''}</td>
    </tr></table>
  </td></tr>
  <tr><td style="${paint(C.panel)}border:1px solid ${C.line};border-top:0;padding:30px 26px 30px;">
    ${kicker ? `<span style="display:inline-block;padding:5px 11px 4px;${paint(C.button)}font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">${keep(esc(kicker), 'span')}</span>` : ''}
    <h1 style="margin:16px 0 18px;font-family:${DISPLAY};font-size:36px;line-height:1.02;font-weight:400;letter-spacing:0.5px;text-transform:uppercase;color:#f4eff8;">${keep(esc(title || subject))}</h1>
    ${lines.map(para).join('\n    ')}
    ${Array.isArray(orders) ? orders.map((o) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;${paint('#1e1628')}border:1px solid ${C.line};"><tr><td style="padding:14px 16px;">
      <span style="display:block;font-family:${DISPLAY};font-size:18px;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;">${keep(esc(o.title), 'span')}</span>
      <span style="display:block;margin:2px 0 10px;font-family:${MONO};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${C.soft};">${esc(o.sub || '')}</span>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${(o.rows || []).map(([l, v]) => `<tr><td style="padding:3px 0;font-family:${BODY};font-size:14px;line-height:1.45;color:${C.text};">${keep(esc(l), 'span')}</td><td align="right" style="padding:3px 0 3px 12px;font-family:${BODY};font-size:14px;color:${C.text};white-space:nowrap;">${esc(v || '')}</td></tr>`).join('')}
        ${o.total ? `<tr><td style="padding:8px 0 0;border-top:1px dashed ${C.line};font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.soft};">Total</td><td align="right" style="padding:8px 0 0 12px;border-top:1px dashed ${C.line};font-family:${DISPLAY};font-size:18px;color:#ffffff;">${keep(esc(o.total), 'span')}</td></tr>` : ''}
      </table>
      ${o.foot ? `<span style="display:block;margin-top:10px;font-family:${BODY};font-size:13px;line-height:1.5;color:${C.soft};">${esc(o.foot)}</span>` : ''}
    </td></tr></table>`).join('\n    ') : ''}
    ${code ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;"><tr><td style="${paint('#1e1628')}border:2px dashed ${C.gold};padding:14px 22px;">
      <span style="display:block;font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.gold};">${keep(esc(code.label || 'Your code'), 'span')}</span>
      <span style="display:block;margin-top:6px;font-family:${MONO};font-size:26px;font-weight:700;letter-spacing:3px;color:#ffffff;">${keep(esc(code.text), 'span')}</span>
      ${code.note ? `<span style="display:block;margin-top:6px;font-family:${BODY};font-size:13px;color:${C.soft};">${esc(code.note)}</span>` : ''}
    </td></tr></table>` : ''}
    ${picture ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px;"><tr>
      <td style="vertical-align:middle;"><img src="${esc(pictureUrl(picture.src))}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;border-radius:50%;border:3px solid ${C.gold};"></td>
      <td style="vertical-align:middle;padding-left:14px;font-family:${BODY};font-size:14px;line-height:1.55;color:${C.text};"><strong style="display:block;margin-bottom:2px;font-family:${DISPLAY};font-size:17px;font-weight:400;letter-spacing:0.5px;text-transform:uppercase;color:${C.gold};">${esc(picture.title)}</strong>${keep(esc(picture.text), 'span')}</td>
    </tr></table>` : ''}
    ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 6px;"><tr><td style="${paint(C.button)}border-right:6px solid #540075;border-bottom:6px solid #540075;">
      <a href="${esc(button.url)}" style="display:inline-block;padding:14px 26px;font-family:${DISPLAY};font-size:17px;font-weight:400;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${keep(`${esc(button.label)} &rarr;`, 'span')}</a>
    </td></tr></table>
    <p style="margin:18px 0 0;font-family:${BODY};font-size:12px;line-height:1.6;color:${C.soft};">Button not working? Paste this into your browser:<br><a href="${esc(button.url)}" style="color:${C.accent};word-break:break-all;text-decoration:underline;">${esc(button.url)}</a></p>` : ''}
    ${after ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px dashed ${C.line};font-family:${BODY};font-size:13px;line-height:1.6;color:${C.soft};">${esc(after)}</p>` : ''}
  </td></tr>
  <tr><td align="center" style="padding:20px 10px 0;font-family:${BODY};font-size:12px;line-height:1.7;color:#7d7288;${paint(C.page)}">
    ${b.tagline ? `${esc(b.tagline)}${b.location ? ` &middot; ${esc(b.location)}` : ''}<br>` : ''}<a href="${esc(home)}" style="color:${C.soft};text-decoration:underline;">${esc(home.replace(/^https?:\/\//, ''))}</a>${insta ? ` &middot; <a href="${esc(insta.url)}" style="color:${C.soft};text-decoration:underline;">Instagram</a>` : ''}
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

export const sendMail = async (mail) => {
  const { to, subject, lines = [], button, after } = mail
  const brand = process.env.MAIL_BRAND || brandInfo().name || 'JBeatsArt'
  const text = [mail.title || subject, '', ...lines, ...(Array.isArray(mail.orders) ? mail.orders.map((o) => ['', `${o.title} (${o.sub || ''})`, ...(o.rows || []).map(([l, v]) => `  ${l}  ${v || ''}`), o.total ? `  Total  ${o.total}` : '', o.foot ? `  ${o.foot}` : ''].filter(Boolean).join('\n')) : []), mail.code ? `\n${mail.code.label || 'Your code'}: ${mail.code.text}${mail.code.note ? ` (${mail.code.note})` : ''}` : '', mail.picture ? `\n${mail.picture.title}: ${mail.picture.text}` : '', button ? `\n${button.label}: ${button.url}` : '', after ? `\n${after}` : '', '', `— ${brand}`].join('\n')
  if (!mailReady()) {
    // on this computer the link is printed instead, so the whole journey can be tried without email
    if (!process.env.VERCEL) console.log(`\n[email to ${to}] ${subject}\n${text}\n`)
    else console.warn('email not sent: no SMTP_* or RESEND_API_KEY / MAIL_FROM set')
    return false
  }
  const html = emailHtml(mail)
  const from = process.env.MAIL_FROM || `${brand} <${process.env.SMTP_USER}>`
  const replyTo = mail.replyTo || process.env.MAIL_REPLY_TO || undefined // a contact message: replies go to the visitor
  if (smtpReady()) {
    try {
      await smtp().sendMail({ from, to, subject, text, html, replyTo })
      return true
    } catch (e) { console.error('the email server refused the email:', e && (e.response || e.message)); return false }
  }
  try {
    const answer = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }) })
    if (!answer.ok) console.error('resend refused the email:', answer.status)
    return answer.ok
  } catch (e) { console.error('could not reach resend:', e.message); return false }
}

// ---------- what the browser is told about the customer
export const publicUser = (u) => (u ? {
  email: u.email,
  name: u.name || '',
  phone: u.phone || '',
  verified: Boolean(u.verified),
  marketing: Boolean(u.marketing),
  createdAt: u.createdAt,
  lastVisit: u.prevLogin || u.createdAt, // for "new since your last visit"
  avatar: typeof u.avatar === 'string' ? u.avatar : '',
  card: typeof u.card === 'string' ? u.card : '', // the membership card design they chose (a reward)
  gifts: Array.isArray(u.gifts) ? u.gifts : [], // rewards the admin gifted them (they count as earned)
  newGifts: Array.isArray(u.newGifts) ? u.newGifts : [], // gifted and not seen yet: the account page says so ("code:<id>" for a code)
  giftCodes: Array.isArray(u.giftCodes) ? u.giftCodes.map((g) => ({ id: g.id, code: g.code, percent: g.percent, until: g.until || null, usedAt: g.usedAt || '' })) : [], // discount codes the admin gave them
  memberNo: Number(u.memberNo) || null, // the order they signed up in: the first customer is 1
  saved: Array.isArray(u.saved) ? u.saved : [],
  cart: Array.isArray(u.cart) ? u.cart : [],
} : null)

// a list of pieces (by their slug), made safe to keep: no repeats, at most 100
export const cleanSlugs = (list) => [...new Set((Array.isArray(list) ? list : []).map((s) => clean(s, 80)).filter((s) => /^[a-z0-9-]{1,80}$/.test(s)))].slice(0, 100)

// a cart from the browser, made safe to keep: { slug, size, signed, qty } lines
export const cleanCart = (lines) => (Array.isArray(lines) ? lines : []).slice(0, 30)
  .map((l) => ({ slug: clean(l && l.slug, 80), size: clean(l && l.size, 40), signed: Boolean(l && l.signed), qty: Math.min(10, Math.max(1, Math.round(Number(l && l.qty) || 1))) }))
  .filter((l) => /^[a-z0-9-]{1,80}$/.test(l.slug))
// two carts become one: the same print, size and signature is kept once, with the larger count
// (the browser's cart and the account's often hold the same lines already)
export const mergeCarts = (a, b) => {
  const out = []
  for (const l of [...cleanCart(a), ...cleanCart(b)]) {
    const same = out.find((x) => x.slug === l.slug && x.size === l.size && x.signed === l.signed)
    if (same) same.qty = Math.max(same.qty, l.qty)
    else out.push({ ...l })
  }
  return out.slice(0, 30)
}
