import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
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

// ---------- email (Resend: RESEND_API_KEY, and MAIL_FROM such as "JBeatsArt <hello@your-domain>")
export const siteUrl = (req) => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL ? '' : `http://${req.headers.host}`)).replace(/\/$/, '')
export const mailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const sendMail = async ({ to, subject, lines, button }) => {
  const brand = process.env.MAIL_BRAND || 'JBeatsArt'
  const text = [...lines, button ? `\n${button.label}: ${button.url}` : '', '', `— ${brand}`].join('\n')
  if (!mailReady()) {
    // on this computer the link is printed instead, so the whole journey can be tried without email
    if (!process.env.VERCEL) console.log(`\n[email to ${to}] ${subject}\n${text}\n`)
    else console.warn('email not sent: RESEND_API_KEY / MAIL_FROM are not set')
    return false
  }
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1622">
    <p style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#8b3fd1;margin:0 0 18px">${esc(brand)}</p>
    ${lines.map((l) => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${esc(l)}</p>`).join('')}
    ${button ? `<p style="margin:26px 0"><a href="${esc(button.url)}" style="background:#b55cf0;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;display:inline-block">${esc(button.label)}</a></p><p style="font-size:13px;color:#6b6475">Or paste this into your browser: ${esc(button.url)}</p>` : ''}
  </div>`
  try {
    const answer = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }) })
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
