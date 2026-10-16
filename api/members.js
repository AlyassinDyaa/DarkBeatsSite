import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { configured, goodPass } from './_session.js'
import { db, dbReady } from './_db.js'
import { newId, sendMail, siteUrl } from './_users.js'
import { mailingAction } from './_mailings.js'
import { adjustPoints, catchUpPoints, claimSent, pointsRules } from './_points.js'

/* The admin's view of customer accounts, and gifting rewards. A reward the admin gifts counts as
   earned, whatever the customer's orders: its picture or card design opens up, and a discount
   becomes their personal code the next time they look at Rewards (api/account.js).

   GET  /api/members                     every account: who, member number, confirmed, gifts; and the
                                        rewards on offer (from Shop → Rewards)
   POST /api/members { action: 'gift', email, reward, tell }   gifts a reward. tell: email them, and then it waits
                                        (pendingGifts) until they accept it from the email; not
                                        emailed, it is theirs at once
   POST /api/members { action: 'ungift', email, reward }       takes a gift back
   POST /api/members { action: 'adminPoints', email, delta, note }  points added (or taken, below zero) by hand
   POST /api/members { action: 'adminClaimSent', email, claim }     a gift bought with points, marked as sent
   POST /api/members { action: 'adminDeleteMember', email }         the account deleted (its orders stay, without an owner)

   For the logged-in admin only, like api/orders.js. Needs MONGODB_URI. */
const readJson = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }
const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
// the rewards on offer, with the same ids the account pages use
const rewardsOnOffer = () => {
  const page = readJson('content/pages/rewards.json') || {}
  return (Array.isArray(page.pictures) ? page.pictures : []).map((r) => ({ ...r, kind: 'picture' })).concat((Array.isArray(page.cards) ? page.cards : []).map((r) => ({ ...r, kind: 'card' })), (Array.isArray(page.discounts) ? page.discounts : []).map((r) => ({ ...r, kind: 'discount' })), Array.isArray(page.rewards) ? page.rewards : [])
    .filter((r) => r && !r.hidden && (r.kind === 'card' ? r.cardLook || r.cardArt : r.kind === 'discount' ? Number(r.percent) > 0 : r.picture))
    .map((r) => ({ id: slug(r.name) || slug(r.picture), name: String(r.name || ''), kind: ['card', 'discount'].includes(r.kind) ? r.kind : 'picture', percent: Number(r.percent) || 0, picture: r.picture || '', face: String(r.face || ''), cardLook: r.cardLook || 'art', cardArt: r.cardArt || '', cardCrop: String(r.cardCrop || '') }))
}
/* The picture a customer has on (as their account shows it): a free picture or a reward picture
   ("icon:<picture>"), or one of the prints they bought (its slug); with its crop ("x,y,zoom"). */
const pictureOf = (avatar) => {
  if (!avatar) return null
  if (avatar.startsWith('icon:')) {
    const src = avatar.slice(5)
    const listed = [...(((readJson('content/pages/account.json') || {}).icons) || []), ...((readJson('content/pages/rewards.json') || {}).pictures || []), ...(((readJson('content/pages/rewards.json') || {}).rewards) || [])].find((i) => i && i.picture === src)
    return { src, face: String((listed && listed.face) || '') }
  }
  if (!/^[a-z0-9-]{1,80}$/.test(avatar)) return null
  const piece = readJson(`content/work/${avatar}.json`)
  return piece && piece.src ? { src: piece.src, face: String(piece.face || '') } : null
}
const shape = (u) => ({ email: u.email, name: u.name || '', memberNo: Number(u.memberNo) || null, verified: Boolean(u.verified), news: Boolean(u.marketing), unsubscribedAt: u.unsubscribedAt || null, createdAt: u.createdAt, locked: Boolean(u.locked), gifts: Array.isArray(u.gifts) ? u.gifts : [], pending: (Array.isArray(u.pendingGifts) ? u.pendingGifts : []).map((g) => g && g.id).filter(Boolean), card: typeof u.card === 'string' ? u.card : '',
  points: Math.round(Number(u.points) || 0), // their balance (api/_points.js)
  pointsEarned: Math.max(Math.round(Number(u.pointsEarned) || 0), Math.round(Number(u.points) || 0)), // everything earned, ever
  claims: (Array.isArray(u.claims) ? u.claims : []).slice(-20).reverse(), // rewards they spent points on, newest first
  pointsLog: (Array.isArray(u.pointsLog) ? u.pointsLog : []).slice(-10).reverse(), picture: pictureOf(typeof u.avatar === 'string' ? u.avatar : '') })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).json({ message: 'ADMIN_PASSCODE and GITHUB_TOKEN are not set in the Vercel project settings.' })
  const pass = String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, '')
  if (!goodPass(pass)) return res.status(401).json({ message: 'Your login has run out. Sign out of the admin and log in again.' })
  if (!dbReady()) return res.status(503).json({ setup: true, message: 'Customer accounts are not set up (MONGODB_URI).' })
  const users = (await db()).collection('users')

  try {
    // Orders → Emails: news and notices to many customers at once (api/_mailings.js)
    if (req.method === 'POST' && req.body && typeof req.body === 'object' && String(req.body.action || '').startsWith('adminMail')) {
      const [status, answer] = await mailingAction(req, await db(), String(req.body.action), req.body)
      return res.status(status).json(answer)
    }
    if (req.method === 'GET') {
      // every account caught up on its points first (those not looked at for a while, a hundred at a time), so the balances are right
      if (pointsRules().on) {
        const d = await db()
        const due = await users.find({ $or: [{ pointsCheckedAt: { $exists: false } }, { pointsCheckedAt: { $lt: Date.now() - 5 * 60000 } }] }).limit(100).toArray()
        for (const u of due) { try { await catchUpPoints(d, u) } catch (e) { console.error('points not caught up:', e.message) } }
      }
      const list = await users.find({}).sort({ memberNo: 1 }).limit(2000).toArray()
      const members = list.map(shape)
      // a print taken off the site since: the picture its order kept
      const lost = [...new Set(list.filter((u, n) => !members[n].picture && /^[a-z0-9-]{1,80}$/.test(String(u.avatar || ''))).map((u) => u.avatar))]
      if (lost.length) {
        try {
          const kept = new Map()
          for (const o of await (await db()).collection('orders').find({ 'items.slug': { $in: lost } }).limit(500).toArray()) for (const i of o.items || []) if (lost.includes(i.slug) && i.src && !kept.has(i.slug)) kept.set(i.slug, i.src)
          list.forEach((u, n) => { if (!members[n].picture && kept.has(u.avatar)) members[n].picture = { src: kept.get(u.avatar), face: '' } })
        } catch (e) { console.error('kept pictures not read:', e.message) }
      }
      return res.status(200).json({ members, rewards: rewardsOnOffer() })
    }
    if (req.method !== 'POST') return res.status(405).json({ message: 'Read with GET, gift with POST.' })
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254)
    // points by hand, a claimed gift marked as sent, and the account deleted: no reward of the lists involved
    if (['adminPoints', 'adminClaimSent', 'adminDeleteMember'].includes(body.action)) {
      const d = await db()
      const who = email && await users.findOne({ email })
      if (!who) return res.status(404).json({ message: 'There is no account with that email.' })
      if (body.action === 'adminDeleteMember') {
        // a protected account (locked: true in the database, the site's own) is never deleted
        if (who.locked) return res.status(403).json({ message: `${who.name || who.email}'s account is protected and cannot be deleted.`, locked: true })
        // logins and links gone, the orders kept for the shop's records (as when they delete it themselves)
        await d.collection('sessions').deleteMany({ userId: who._id })
        await d.collection('tokens').deleteMany({ userId: who._id })
        await d.collection('orders').updateMany({ userId: who._id }, { $set: { userId: null } })
        await users.deleteOne({ _id: who._id, locked: { $ne: true } })
        return res.status(200).json({ ok: true, deleted: true })
      }
      const [status, answer] = body.action === 'adminPoints' ? await adjustPoints(d, who, body.delta, body.note) : await claimSent(d, who, body.claim)
      return res.status(status).json(status === 200 ? { ok: true, member: shape(await users.findOne({ _id: who._id })) } : answer)
    }
    const reward = rewardsOnOffer().find((r) => r.id === String(body.reward || ''))
    if (!reward) return res.status(400).json({ message: 'That reward is not on offer any more. Reload the page.' })
    const user = email && await users.findOne({ email })
    if (!user) return res.status(404).json({ message: 'There is no account with that email.' })
    const gifts = Array.isArray(user.gifts) ? user.gifts : []

    if (body.action === 'gift') {
      const waiting = Array.isArray(user.pendingGifts) ? user.pendingGifts : []
      if (gifts.includes(reward.id) || waiting.some((g) => g && g.id === reward.id)) return res.status(409).json({ message: `${user.name || user.email} already has "${reward.name}"${waiting.some((g) => g && g.id === reward.id) ? ' (waiting for them to accept it from the email)' : ''}.` })
      // theirs at once: in their gifts, and new to them until they have seen it
      const giveNow = async () => {
        const now = await users.findOne({ _id: user._id })
        const have = Array.isArray(now.gifts) ? now.gifts : []
        const next = have.includes(reward.id) ? have : [...have, reward.id]
        const fresh = (Array.isArray(now.newGifts) ? now.newGifts : []).filter((g) => g !== reward.id).concat([reward.id])
        await users.updateOne({ _id: user._id }, { $set: { gifts: next, newGifts: fresh, pendingGifts: (Array.isArray(now.pendingGifts) ? now.pendingGifts : []).filter((g) => g && g.id !== reward.id) } })
      }
      // emailed: it waits for them to accept it from the email (a link carrying the gift's own token)
      const token = newId('g')
      if (body.tell) await users.updateOne({ _id: user._id }, { $set: { pendingGifts: [...waiting, { id: reward.id, token, at: Date.now() }] } })
      else await giveNow()
      let told = false
      if (body.tell) {
        const first = (user.name || '').split(' ')[0]
        const what = reward.kind === 'discount' ? `${reward.percent}% off one order` : reward.kind === 'card' ? `the ${reward.name} membership card design` : `the ${reward.name} profile picture`
        // worded as the account notice it is (a subject like "A gift for you" is what spam filters look for)
        try {
          told = await sendMail({
            to: user.email,
            subject: `New in your JBeatsArt account: ${reward.name}`,
            kicker: 'Your account',
            title: 'A reward is waiting for you',
            lines: [`Hi${first ? ` ${first}` : ''},`, `Jordan has set aside a reward for you: ${what}.`, 'Press the button to accept it, and it goes straight into your account.', reward.kind === 'discount' ? 'A discount gets its own code under Rewards in your account, ready for your next order.' : 'Then you can use it from Details in your account.'],
            ...(reward.kind === 'picture' && reward.picture ? { picture: { src: reward.picture, title: reward.name, text: 'Now one of your profile pictures.' } } : {}),
            button: { label: 'Accept the gift', url: `${siteUrl(req)}/account/gift?u=${encodeURIComponent(user._id)}&t=${encodeURIComponent(token)}` },
            after: 'You are getting this because you have an account on JBeatsArt.',
          })
        } catch (e) { console.error('gift email not sent:', e.message) }
        // the email could not go, so there is nothing to accept it from: theirs at once
        if (!told) await giveNow()
      }
      return res.status(200).json({ member: shape(await users.findOne({ _id: user._id })), told, pending: Boolean(body.tell && told) })
    }

    if (body.action === 'ungift') {
      // taken back, whether theirs or still waiting to be accepted (its link stops working)
      const next = gifts.filter((g) => g !== reward.id)
      const waiting = (Array.isArray(user.pendingGifts) ? user.pendingGifts : []).filter((g) => g && g.id !== reward.id)
      await users.updateOne({ _id: user._id }, { $set: { gifts: next, pendingGifts: waiting, newGifts: (Array.isArray(user.newGifts) ? user.newGifts : []).filter((g) => g !== reward.id) } })
      return res.status(200).json({ member: shape({ ...user, gifts: next, pendingGifts: waiting }) })
    }

    return res.status(400).json({ message: 'Nothing to do.' })
  } catch (e) {
    console.error('members:', e && e.message)
    return res.status(500).json({ message: 'Something went wrong. Try again in a moment.' })
  }
}

