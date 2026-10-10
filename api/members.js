import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { configured, goodPass } from './_session.js'
import { db, dbReady } from './_db.js'
import { sendMail, siteUrl } from './_users.js'
import { mailingAction } from './_mailings.js'

/* The admin's view of customer accounts, and gifting rewards. A reward the admin gifts counts as
   earned, whatever the customer's orders: its picture or card design opens up, and a discount
   becomes their personal code the next time they look at Rewards (api/account.js).

   GET  /api/members                     every account: who, member number, confirmed, gifts; and the
                                        rewards on offer (from Shop → Rewards)
   POST /api/members { action: 'gift', email, reward, tell }   gifts a reward (tell: email them)
   POST /api/members { action: 'ungift', email, reward }       takes a gift back

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
const shape = (u) => ({ email: u.email, name: u.name || '', memberNo: Number(u.memberNo) || null, verified: Boolean(u.verified), news: Boolean(u.marketing), unsubscribedAt: u.unsubscribedAt || null, createdAt: u.createdAt, gifts: Array.isArray(u.gifts) ? u.gifts : [], card: typeof u.card === 'string' ? u.card : '', picture: pictureOf(typeof u.avatar === 'string' ? u.avatar : '') })

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
    const reward = rewardsOnOffer().find((r) => r.id === String(body.reward || ''))
    if (!reward) return res.status(400).json({ message: 'That reward is not on offer any more. Reload the page.' })
    const user = email && await users.findOne({ email })
    if (!user) return res.status(404).json({ message: 'There is no account with that email.' })
    const gifts = Array.isArray(user.gifts) ? user.gifts : []

    if (body.action === 'gift') {
      const next = gifts.includes(reward.id) ? gifts : [...gifts, reward.id]
      // new to them: their account page says so until they have seen it
      const fresh = (Array.isArray(user.newGifts) ? user.newGifts : []).filter((g) => g !== reward.id).concat(gifts.includes(reward.id) ? [] : [reward.id])
      await users.updateOne({ _id: user._id }, { $set: { gifts: next, newGifts: fresh } })
      let told = false
      if (body.tell && !gifts.includes(reward.id)) {
        const first = (user.name || '').split(' ')[0]
        const what = reward.kind === 'discount' ? `${reward.percent}% off one order` : reward.kind === 'card' ? `the ${reward.name} membership card design` : `the ${reward.name} profile picture`
        // worded as the account notice it is (a subject like "A gift for you" is what spam filters look for)
        try {
          told = await sendMail({
            to: user.email,
            subject: `New in your JBeatsArt account: ${reward.name}`,
            kicker: 'Your account',
            title: 'A new reward',
            lines: [`Hi${first ? ` ${first}` : ''},`, `Jordan has added a reward to your account: ${what}.`, reward.kind === 'discount' ? 'Your code is under Rewards in your account, ready for your next order.' : 'You can use it from Details in your account.'],
            ...(reward.kind === 'picture' && reward.picture ? { picture: { src: reward.picture, title: reward.name, text: 'Now one of your profile pictures.' } } : {}),
            button: { label: 'See your gift', url: `${siteUrl(req)}/account?tab=rewards` },
            after: 'You are getting this because you have an account on JBeatsArt.',
          })
        } catch (e) { console.error('gift email not sent:', e.message) }
      }
      return res.status(200).json({ member: shape({ ...user, gifts: next }), told })
    }

    if (body.action === 'ungift') {
      const next = gifts.filter((g) => g !== reward.id)
      await users.updateOne({ _id: user._id }, { $set: { gifts: next, newGifts: (Array.isArray(user.newGifts) ? user.newGifts : []).filter((g) => g !== reward.id) } })
      return res.status(200).json({ member: shape({ ...user, gifts: next }) })
    }

    return res.status(400).json({ message: 'Nothing to do.' })
  } catch (e) {
    console.error('members:', e && e.message)
    return res.status(500).json({ message: 'Something went wrong. Try again in a moment.' })
  }
}

