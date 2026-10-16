import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { db, dbReady } from './_db.js'
import { artistInbox, sendMail } from './_users.js'

/* Points: a balance on every account, earned and spent, with the rules set in the admin under
   Rewards → Points (content/pages/rewards.json, "points").
     - every paid order and commission earns points for what was paid (perUnit points a unit of
       currency, whole points, counted once per order; taken back if the payment is refunded)
     - each detail of the account earns the detail points, once each, the moment it is there: the
       name, the phone number, the email, and the password (which counts as two, typed and confirmed)
     - confirming the email earns the sign-up points, once
     - saying yes to news emails earns the news points, once ever: taken back on unsubscribing,
       and not given again
     - the admin can add or take points by hand, with a note
     - points are spent on the rewards of the ladder: a discount (a code of their own, made in
       Stripe like the earned ones) or a gift the artist arranges (a free print, say), which the
       customer claims and the artist marks as sent under Customers
   Each change is kept in the account's log (the last 200), with why and what for. */

const readJson = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }
const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
// the artist's first name, for the emails (Brand & contact)
const artist = () => String((readJson('content/site/brand.json') || {}).artist || 'The artist').trim().split(' ')[0]
const whole = (n, fallback) => { const x = Number(n); return Number.isFinite(x) && x >= 0 ? Math.round(x) : fallback }

export const pointsRules = () => {
  const p = ((readJson('content/pages/rewards.json') || {}).points) || {}
  const rewards = (Array.isArray(p.rewards) ? p.rewards : [])
    .filter((r) => r && !r.hidden && r.name && whole(r.cost, 0) > 0 && (r.kind === 'discount' ? Number(r.percent) > 0 : true))
    .map((r) => ({
      id: slug(r.name), name: String(r.name), cost: whole(r.cost, 0), kind: r.kind === 'discount' ? 'discount' : 'gift',
      text: String(r.text || ''), percent: r.kind === 'discount' ? Math.min(100, Math.max(1, Number(r.percent) || 10)) : 0, days: Math.max(1, whole(r.days, 60)),
    }))
    .sort((a, b) => a.cost - b.cost)
  return {
    on: p.on !== false,
    perUnit: Number.isFinite(Number(p.perUnit)) && Number(p.perUnit) >= 0 ? Number(p.perUnit) : 1,
    signup: whole(p.signup, 50), news: whole(p.news, 25), field: whole(p.field, 10),
    name: String(p.name || 'points').trim() || 'points',
    intro: String(p.intro || ''),
    rewards,
  }
}

// a change to a balance, with its line in the log (the last 200 are kept)
export const addPoints = async (d, userId, delta, why, ref = '') => {
  const n = Math.round(Number(delta) || 0)
  if (!n || !userId) return 0
  await d.collection('users').updateOne({ _id: userId }, { $inc: { points: n, ...(n > 0 ? { pointsEarned: n } : {}) }, $push: { pointsLog: { $each: [{ at: Date.now(), delta: n, why, ref: String(ref || '').slice(0, 120) }], $slice: -200 } } })
  return n
}

// an order's points to an account, once (the order remembers who had them)
const awardOrder = async (d, ref, userId, rules) => {
  const got = await d.collection('orders').findOneAndUpdate({ ref, status: 'paid', pointsGiven: { $exists: false } }, { $set: { pointsGiven: true, pointsTo: userId } }, { returnDocument: 'after' })
  const o = got && (got.value !== undefined ? got.value : got)
  if (!o) return 0
  const n = Math.floor((Number(o.amount) || 0) * rules.perUnit)
  if (n > 0) { await addPoints(d, userId, n, 'order', o.orderNo || ref); await d.collection('orders').updateOne({ ref }, { $set: { points: n } }) }
  return n
}
// a paid shop order: points for what was paid, once, for the account it was placed in
export const awardOrderPoints = async (ref) => {
  if (!dbReady()) return 0
  const rules = pointsRules()
  if (!rules.on || !rules.perUnit) return 0
  const d = await db()
  const o = await d.collection('orders').findOne({ ref }, { projection: { userId: 1 } })
  return o && o.userId ? awardOrder(d, ref, o.userId, rules) : 0
}
// a refunded shop order: its points taken back, once
export const takeOrderPoints = async (match) => {
  if (!dbReady()) return
  const d = await db()
  const got = await d.collection('orders').findOneAndUpdate({ ...match, pointsGiven: true, points: { $gt: 0 }, pointsTaken: { $exists: false } }, { $set: { pointsTaken: true } }, { returnDocument: 'after' })
  const o = got && (got.value !== undefined ? got.value : got)
  const who = o && (o.pointsTo || o.userId)
  if (who) await addPoints(d, who, -o.points, 'refund', o.orderNo || o.ref)
}
// a paid commission, the same way
export const awardCommissionPoints = async (c) => {
  if (!dbReady() || !c || !c.userId || !c.payment) return 0
  const rules = pointsRules()
  if (!rules.on || !rules.perUnit) return 0
  const d = await db()
  const got = await d.collection('commissions').findOneAndUpdate({ _id: c._id, pointsGiven: { $exists: false } }, { $set: { pointsGiven: true } }, { returnDocument: 'after' })
  if (!got) return 0
  const n = Math.floor((Number(c.payment.amount) || 0) * rules.perUnit)
  if (n > 0) { await addPoints(d, c.userId, n, 'commission', c.number); await d.collection('commissions').updateOne({ _id: c._id }, { $set: { points: n } }) }
  return n
}
export const takeCommissionPoints = async (id) => {
  if (!dbReady()) return
  const d = await db()
  const got = await d.collection('commissions').findOneAndUpdate({ _id: id, pointsGiven: true, points: { $gt: 0 }, pointsTaken: { $exists: false } }, { $set: { pointsTaken: true } }, { returnDocument: 'after' })
  const c = got && (got.value !== undefined ? got.value : got)
  if (c && c.userId) await addPoints(d, c.userId, -c.points, 'refund', c.number)
}

// the sign-up points, once the email is confirmed (once); and the news points if they said yes when signing up
export const signupPoints = async (d, user) => {
  const rules = pointsRules()
  if (!rules.on || !user) return
  if (rules.signup > 0 && !user.pointsSignup) {
    const claim = await d.collection('users').updateOne({ _id: user._id, pointsSignup: { $exists: false } }, { $set: { pointsSignup: true } })
    if (claim.modifiedCount) await addPoints(d, user._id, rules.signup, 'signup')
  }
  if (user.marketing) await newsPoints(d, { ...user, verified: true }, true)
  await fieldPoints(d, { ...user, verified: true })
}
// the details of the account: points for each, once, as soon as it is there (the password counts as two: typed and confirmed)
export const FIELDS = ['name', 'phone', 'email', 'password']
const FIELD_WEIGHT = { name: 1, phone: 1, email: 1, password: 2 }
const FIELD_WORDS = { name: 'name', phone: 'phone number', email: 'email', password: 'password' }
export const fieldPoints = async (d, user) => {
  const rules = pointsRules()
  if (!rules.on || !rules.field || !user) return
  for (const k of FIELDS) {
    if (!String(user[k] || '').trim() || (user.pointsFields && user.pointsFields[k])) continue
    const claim = await d.collection('users').updateOne({ _id: user._id, [`pointsFields.${k}`]: { $exists: false } }, { $set: { [`pointsFields.${k}`]: true } })
    if (claim.modifiedCount) await addPoints(d, user._id, rules.field * FIELD_WEIGHT[k], 'detail', FIELD_WORDS[k])
  }
}
/* The news points: given once ever on saying yes (an account with a confirmed email), taken back
   on saying no, and not given a second time. */
export const newsPoints = async (d, user, on) => {
  const rules = pointsRules()
  if (!rules.on || !user || !rules.news) return
  const users = d.collection('users')
  if (on) {
    if (!user.verified || user.newsBonus) return
    const claim = await users.updateOne({ _id: user._id, newsBonus: { $exists: false } }, { $set: { newsBonus: 'given' } })
    if (claim.modifiedCount) await addPoints(d, user._id, rules.news, 'news')
  } else if (user.newsBonus === 'given') {
    const claim = await users.updateOne({ _id: user._id, newsBonus: 'given' }, { $set: { newsBonus: 'taken' } })
    if (claim.modifiedCount) await addPoints(d, user._id, -rules.news, 'news-off')
  }
}

/* Catching up: everything an account is owed under the rules as they are now, each paid once
   (every order, commission and bonus remembers it was paid). Run when the account is looked at
   (at most every few minutes) and for every member when the admin opens Customers, so accounts
   from before points, and everything that happened while points were switched off, are put right
   as soon as they are on: the paid orders (those of the account, and with the email confirmed
   those placed with its address), the paid commissions, the email confirmed, the news, and the
   details. A refund since, or an unsubscribe, is not paid. */
export const catchUpPoints = async (d, user, { force = false } = {}) => {
  const rules = pointsRules()
  if (!rules.on || !user) return false
  const users = d.collection('users')
  if (!force) {
    const claim = await users.updateOne({ _id: user._id, $or: [{ pointsCheckedAt: { $exists: false } }, { pointsCheckedAt: { $lt: Date.now() - 5 * 60000 } }] }, { $set: { pointsCheckedAt: Date.now() } })
    if (!claim.modifiedCount) return false
  } else await users.updateOne({ _id: user._id }, { $set: { pointsCheckedAt: Date.now() } })
  const before = Math.round(Number(user.points) || 0)
  if (rules.perUnit) {
    const mine = user.verified ? { $or: [{ userId: user._id }, { email: String(user.email || '').toLowerCase() }] } : { userId: user._id }
    const orders = await d.collection('orders').find({ ...mine, status: 'paid', hidden: { $ne: true }, 'track.status': { $ne: 'cancelled' }, pointsGiven: { $exists: false } }, { projection: { ref: 1 } }).limit(500).toArray()
    for (const o of orders) await awardOrder(d, o.ref, user._id, rules)
    const coms = await d.collection('commissions').find({ userId: user._id, 'payment.paidAt': { $exists: true }, 'payment.refunded': { $ne: true }, pointsGiven: { $exists: false } }).limit(200).toArray()
    for (const c of coms) await awardCommissionPoints(c)
  }
  if (user.verified) await signupPoints(d, user)
  else await fieldPoints(d, user)
  await newsPoints(d, user, Boolean(user.marketing))
  const now = await users.findOne({ _id: user._id }, { projection: { points: 1 } })
  return Math.round(Number(now && now.points) || 0) !== before
}

// what the account page shows: the rules, the balance, the ladder, what was claimed, the log
export const pointsView = (user) => {
  const rules = pointsRules()
  const balance = Math.max(0, Math.round(Number(user.points) || 0))
  return {
    on: rules.on, name: rules.name, intro: rules.intro, perUnit: rules.perUnit, signup: rules.signup, news: rules.news, field: rules.field,
    fields: ['name', 'phone'].filter((k) => !(user.pointsFields && user.pointsFields[k])), // the details still to fill in for points
    balance,
    earned: Math.max(balance, Math.round(Number(user.pointsEarned) || 0)), // everything earned, ever (spent or not)
    newsBonus: user.newsBonus || '', // 'given', 'taken' (gone for good), or nothing yet
    rewards: rules.rewards.map((r) => ({ ...r, can: balance >= r.cost })),
    claims: (Array.isArray(user.claims) ? user.claims : []).slice().reverse().slice(0, 30),
    log: (Array.isArray(user.pointsLog) ? user.pointsLog : []).slice(-30).reverse(),
  }
}

/* Spending points on one of the ladder's rewards. The balance is taken down only if it covers the
   cost (one request at a time). A discount gets a code of its own through makeCode (the account's
   reward-code maker); a gift is a claim the artist is emailed about and marks as sent. */
export const redeemPoints = async (d, user, id, { makeCode, site = '' } = {}) => {
  const rules = pointsRules()
  if (!rules.on) return [400, { message: 'Points are not running right now.' }]
  const r = rules.rewards.find((x) => x.id === String(id || ''))
  if (!r) return [400, { message: 'That reward is no longer offered. Reload and look again.' }]
  const users = d.collection('users')
  const claim = { id: `cl_${randomBytes(6).toString('hex')}`, rewardId: r.id, name: r.name, kind: r.kind, cost: r.cost, text: r.text, at: Date.now(), status: r.kind === 'discount' ? 'ready' : 'requested' }
  const took = await users.updateOne({ _id: user._id, points: { $gte: r.cost } }, { $inc: { points: -r.cost }, $push: { pointsLog: { $each: [{ at: claim.at, delta: -r.cost, why: 'redeem', ref: r.name }], $slice: -200 }, claims: claim } })
  if (!took.modifiedCount) return [400, { message: `Not enough ${rules.name} yet: ${r.name} takes ${r.cost}.` }]
  let code = null
  if (r.kind === 'discount' && makeCode) {
    try { code = await makeCode({ id: `pts-${claim.id}`, name: r.name, percent: r.percent, days: r.days }) } catch (e) { console.error('points code not made:', e.message) }
    if (code && code.code) await users.updateOne({ _id: user._id, 'claims.id': claim.id }, { $set: { 'claims.$.code': { code: code.code, percent: code.percent, until: code.until } } })
  }
  const first = (user.name || '').split(' ')[0]
  const home = String(site || '').replace(/\/$/, '')
  try {
    await sendMail({
      to: user.email,
      subject: `Your ${rules.name}: ${r.name}`,
      kicker: 'Your rewards',
      title: r.name,
      lines: [
        `Hi${first ? ` ${first}` : ''},`,
        `You turned ${r.cost} ${rules.name} into ${r.name}${r.text ? `: ${r.text}` : ''}.`,
        r.kind === 'discount'
          ? (code && code.code ? `Your code is below: type it in the cart on your next order. It is good for ${r.days} days.` : 'Your code is being made: it shows under Rewards in your account in a moment.')
          : `${artist()} has been told, and will be in touch about getting it to you.`,
      ],
      code: code && code.code ? { label: 'Your code', text: code.code, note: `${r.percent}% off one order` } : undefined,
      button: { label: 'Your rewards', url: `${home}/account?tab=rewards` },
      after: 'You are getting this because you have an account on JBeatsArt.',
    })
  } catch (e) { console.error('points email not sent:', e.message) }
  if (r.kind === 'gift') {
    const to = artistInbox()
    if (to) {
      try {
        await sendMail({
          to, subject: `${rules.name} claimed: ${r.name} for ${user.name || user.email}`, kicker: 'Rewards', title: `${r.name} claimed`,
          lines: [`${user.name || user.email} (${user.email}) spent ${r.cost} ${rules.name} on "${r.name}"${r.text ? ` (${r.text})` : ''}.`, 'Arrange it with them, then mark it as sent in the admin: Customers → their window → Points.'],
          button: { label: 'Open Customers', url: `${home}/admin/#/customers` },
        })
      } catch (e) { console.error('points claim email not sent:', e.message) }
    }
  }
  return [200, { ok: true, claim: { ...claim, ...(code && code.code ? { code: { code: code.code, percent: code.percent, until: code.until } } : {}) } }]
}

// the admin: points added or taken by hand, with a note; a claimed gift marked as sent
export const adjustPoints = async (d, user, delta, note) => {
  const n = Math.round(Number(delta) || 0)
  if (!n) return [400, { message: 'How many points? A number above or below zero.' }]
  if (Math.abs(n) > 100000) return [400, { message: 'That is a lot of points. Up to 100000 at a time.' }]
  await addPoints(d, user._id, n, 'admin', String(note || '').slice(0, 120))
  return [200, { ok: true }]
}
export const claimSent = async (d, user, claimId) => {
  const got = await d.collection('users').updateOne({ _id: user._id, 'claims.id': String(claimId || '') }, { $set: { 'claims.$.status': 'sent', 'claims.$.sentAt': Date.now() } })
  return got.modifiedCount ? [200, { ok: true }] : [400, { message: 'That claim is not there.' }]
}
