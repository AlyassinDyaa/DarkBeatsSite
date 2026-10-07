import { randomBytes } from 'node:crypto'
import { configured, goodPass } from './_session.js'

/* The admin's Discounts screen. A discount is a percentage off, for a while, given either to
   chosen customers (each gets a code of their own) or to anyone who has the code. They are made
   and kept in Stripe (a coupon, with one promotion code per person), so the buyer types the code
   on Stripe's payment page and Stripe takes the discount off; the checkout (api/checkout.js)
   shows the box for it. Nothing about the people is written to the site's repository.

   GET  /api/discounts                       every discount made here, newest first
   POST /api/discounts { action: 'create', percent, until, label, uses, people: [{ email, name }] | code }
   POST /api/discounts { action: 'stop', id }   switches one code off
   POST /api/discounts { action: 'delete', ids }  switches codes off and takes them out of the list
        (Stripe keeps a code once made; it is marked jb_hidden and never listed again)

   Needs STRIPE_SECRET_KEY (Vercel project settings), and the admin's login pass like api/gh.js. */

// Stripe renamed parts of promotion codes in later API versions; these calls ask for one version
// so the fields below always mean the same thing, whatever the account's default is.
const VERSION = '2024-06-20'
const stripe = async (path, init = {}) => {
  const answer = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': VERSION, ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
  })
  const said = await answer.json().catch(() => ({}))
  return { ok: answer.ok, status: answer.status, said }
}
const form = (fields) => { const f = new URLSearchParams(); for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== '') f.set(k, String(v)); return f.toString() }
const text = (v, max = 200) => String(v ?? '').trim().slice(0, max)
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i
const MAX_PEOPLE = 50

// a code that reads well and is hard to guess: PREFIX-NAME-4K7Q
const makeCode = (prefix, name) => {
  const tidy = (t, n) => String(t || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '').slice(0, n)
  const tail = [...randomBytes(4)].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
  return [tidy(prefix, 12) || 'JB', tidy(name, 10), tail].filter(Boolean).join('-')
}

const shape = (p) => {
  const c = p.coupon || {}
  const meta = p.metadata || {}
  return {
    id: p.id,
    code: p.code,
    active: Boolean(p.active),
    percent: c.percent_off || 0,
    until: p.expires_at || c.redeem_by || null,
    uses: p.max_redemptions || null,
    used: p.times_redeemed || 0,
    email: text(meta.email, 200),
    name: text(meta.name, 120),
    label: text(c.name, 40),
    batch: text(meta.batch, 40),
    created: p.created,
    test: !p.livemode,
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).json({ message: 'ADMIN_PASSCODE and GITHUB_TOKEN are not set in the Vercel project settings.' })
  const pass = String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, '')
  if (!goodPass(pass)) return res.status(401).json({ message: 'Your login has run out. Sign out of the admin and log in again.' })
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ setup: true, message: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY in the Vercel project settings to make discounts.' })

  try {
    if (req.method === 'GET') {
      // the latest 300 codes; only those made from this admin (marked jb) are listed
      const all = []
      let after = ''
      for (let page = 0; page < 3; page++) {
        const got = await stripe(`promotion_codes?limit=100${after ? `&starting_after=${after}` : ''}`)
        if (!got.ok) return res.status(502).json({ message: got.status === 401 ? 'Stripe did not accept the key in STRIPE_SECRET_KEY.' : 'Stripe did not answer. Try again in a moment.' })
        const data = Array.isArray(got.said.data) ? got.said.data : []
        all.push(...data)
        if (!got.said.has_more || !data.length) break
        after = data[data.length - 1].id
      }
      return res.status(200).json({ discounts: all.filter((p) => p.metadata && p.metadata.jb === '1' && p.metadata.jb_hidden !== '1').map(shape) })
    }

    if (req.method !== 'POST') return res.status(405).json({ message: 'Read discounts with GET, change them with POST.' })
    const body = req.body && typeof req.body === 'object' ? req.body : {}

    if (body.action === 'delete') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map((i) => text(i, 80)).filter((i) => /^promo_[A-Za-z0-9]+$/.test(i))
      if (!ids.length || ids.length > 100) return res.status(400).json({ message: 'Between 1 and 100 codes at a time.' })
      const done = []
      for (const id of ids) {
        const got = await stripe(`promotion_codes/${id}`, { method: 'POST', body: form({ active: 'false', 'metadata[jb_hidden]': '1' }) })
        if (got.ok) done.push(id)
      }
      return res.status(done.length ? 200 : 502).json({ deleted: done, ...(done.length < ids.length ? { message: 'Some could not be deleted. Try again in a moment.' } : {}) })
    }

    if (body.action === 'stop') {
      const id = text(body.id, 80)
      if (!/^promo_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ message: 'That is not a discount code.' })
      const got = await stripe(`promotion_codes/${id}`, { method: 'POST', body: form({ active: 'false' }) })
      if (!got.ok) return res.status(502).json({ message: 'Stripe did not switch it off. Try again in a moment.' })
      return res.status(200).json({ discount: shape(got.said) })
    }

    if (body.action !== 'create') return res.status(400).json({ message: 'Nothing to do.' })
    const percent = Math.round(Number(body.percent) * 100) / 100
    if (!(percent > 0 && percent <= 100)) return res.status(400).json({ message: 'The discount must be between 1% and 100%.' })
    const now = Math.floor(Date.now() / 1000)
    const until = body.until == null || body.until === '' ? null : Math.floor(Number(body.until))
    if (until !== null && !(until > now + 60 && until < now + 5 * 366 * 86400)) return res.status(400).json({ message: 'The end date must be in the future, and within five years.' })
    const uses = body.uses == null || body.uses === '' ? null : Math.round(Number(body.uses))
    if (uses !== null && !(uses >= 1 && uses <= 10000)) return res.status(400).json({ message: 'Each code can be used between 1 and 10,000 times, or without a limit.' })
    const label = text(body.label, 40) || `${percent}% off`
    const batch = `b${now.toString(36)}`

    // who it is for: chosen people (a code each) or anyone with one shared code
    let people = []
    let shared = ''
    if (Array.isArray(body.people) && body.people.length) {
      const seen = new Set()
      for (const p of body.people) {
        const email = text(p && p.email, 200).toLowerCase()
        if (!EMAIL.test(email)) return res.status(400).json({ message: `"${text(p && p.email, 60)}" is not an email address.` })
        if (seen.has(email)) continue
        seen.add(email)
        people.push({ email, name: text(p && p.name, 120) })
      }
      if (people.length > MAX_PEOPLE) return res.status(400).json({ message: `At most ${MAX_PEOPLE} people in one go.` })
    } else {
      shared = text(body.code, 30).toUpperCase()
      if (!/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(shared)) return res.status(400).json({ message: 'A shared code needs 3 to 30 letters, numbers or dashes, for example SPOOKY20.' })
    }

    const coupon = await stripe('coupons', { method: 'POST', body: form({ percent_off: percent, duration: 'once', name: label, redeem_by: until, 'metadata[jb]': '1', 'metadata[batch]': batch }) })
    if (!coupon.ok) {
      console.error('stripe refused the coupon:', coupon.status, coupon.said && coupon.said.error && coupon.said.error.message)
      return res.status(502).json({ message: 'Stripe did not make the discount. Try again in a moment.' })
    }
    const made = []
    const failed = []
    const targets = people.length ? people : [{ email: '', name: '' }]
    for (const person of targets) {
      let got = null
      // a fresh code for each person; a clash with an existing code is retried with a new one
      for (let attempt = 0; attempt < (people.length ? 3 : 1); attempt++) {
        const code = people.length ? makeCode(body.prefix, (person.name || person.email.split('@')[0]).split(/[\s._-]+/)[0]) : shared
        got = await stripe('promotion_codes', { method: 'POST', body: form({ coupon: coupon.said.id, code, expires_at: until, max_redemptions: uses, 'metadata[jb]': '1', 'metadata[batch]': batch, 'metadata[email]': person.email, 'metadata[name]': person.name }) })
        if (got.ok) break
      }
      if (got && got.ok) made.push(shape({ ...got.said, coupon: coupon.said }))
      else failed.push(person.email || shared)
    }
    // nothing made: the discount behind the codes goes too, so it does not linger in Stripe
    if (!made.length) await stripe(`coupons/${coupon.said.id}`, { method: 'DELETE' })
    if (!made.length) return res.status(people.length ? 502 : 409).json({ message: people.length ? 'Stripe did not make the codes. Try again in a moment.' : `The code ${shared} could not be made. It may already be in use: try another.` })
    return res.status(200).json({ discounts: made, failed })
  } catch {
    return res.status(502).json({ message: 'Could not reach Stripe. Try again in a moment.' })
  }
}
