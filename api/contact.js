import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dbReady } from './_db.js'
import { EMAIL, clean, clientIp, fromThisSite, mailReady, noteTry, sendMail, tooMany } from './_users.js'

/* The Contact and Commission forms, sent straight to the artist's inbox: the visitor presses Send
   and that is it, no mail app. The email comes from the site's own address (the SMTP_* or Resend
   settings, the same as the account emails) and replying to it answers the visitor.

   POST { form: 'contact', name, email, topic, message }
   POST { form: 'commission', name, email, kind, idea, refs, due }
   Both also carry `website` (a field people never see: a bot fills it in) and `opened` (when the
   form was shown: a person takes more than a few seconds).

   Where it goes: CONTACT_TO if set, otherwise the contact email in the admin (Site → Brand &
   contact), otherwise the address the site sends from. With no way to send email it answers
   503 and the page offers Instagram or the email address instead. No copy goes to the visitor, so
   nobody can use the form to send emails to other people. */
const read = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return {} } }
const senderAddress = () => { const m = String(process.env.MAIL_FROM || '').match(/<([^>]+)>/); return (m && m[1]) || process.env.SMTP_USER || String(process.env.MAIL_FROM || '').trim() }

// without the database, a count kept by this function while it stays warm
const recent = new Map()
const limited = async (ip) => {
  if (dbReady()) {
    if (await tooMany(`contact:${ip}`, 5, 60)) return true
    await noteTry(`contact:${ip}`)
    return false
  }
  const now = Date.now()
  const list = (recent.get(ip) || []).filter((t) => now - t < 3600e3)
  if (list.length >= 5) return true
  recent.set(ip, [...list, now])
  return false
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const say = (status, body) => res.status(status).json(body)
  if (req.method !== 'POST') return say(405, { message: 'Send the form with POST.' })
  if (!fromThisSite(req)) return say(403, { message: 'That did not come from this site.' })
  const b = req.body && typeof req.body === 'object' ? req.body : {}

  // a bot: it filled in the hidden field, or sent the form the moment it appeared. It is told all
  // went well, so it does not try again, and nothing is sent.
  const opened = Number(b.opened) || 0
  if (clean(b.website, 200) || (opened && Date.now() - opened < 2500)) return say(200, { ok: true })

  const commission = b.form === 'commission'
  const name = clean(b.name, 80)
  const email = clean(b.email, 254).toLowerCase()
  const text = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max)
  const message = text(commission ? b.idea : b.message, 5000)
  if (!name) return say(400, { message: 'Add your name.', field: 'name' })
  if (!EMAIL.test(email)) return say(400, { message: 'That email address does not look right.', field: 'email' })
  if (message.length < 2) return say(400, { message: commission ? 'Tell me the idea.' : 'Write a message.', field: commission ? 'idea' : 'message' })

  const brand = read('content/site/brand.json')
  const to = process.env.CONTACT_TO || brand.email || senderAddress()
  if (!mailReady() || !to) return say(503, { fallback: true, message: 'Messages cannot be sent from the site right now.' })
  if (await limited(clientIp(req))) return say(429, { message: 'A few messages have been sent from here already. Try again in an hour, or write on Instagram.' })

  const paras = message.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean)
  const kind = text(b.kind, 80)
  const topic = text(b.topic, 80)
  const mail = commission
    ? {
      subject: `Commission request: ${kind || 'a piece'} for ${name}`,
      kicker: 'Commission request',
      title: `${kind || 'A commission'} for ${name}`,
      lines: [`From ${name} (${email})`, ...paras, `Reference pictures: ${text(b.refs, 500) || 'none yet'}`, `Needed by: ${text(b.due, 120) || 'no deadline'}`],
    }
    : {
      subject: `${topic ? `[${topic}] ` : ''}Message from ${name}`,
      kicker: topic || 'New message',
      title: `A message from ${name}`,
      lines: [`From ${name} (${email})`, ...paras],
    }
  const sent = await sendMail({ ...mail, to, replyTo: `${name.replace(/[<>"]/g, '')} <${email}>`, after: `Sent from the ${commission ? 'Commissions' : 'Contact'} page. Reply to this email to answer ${name} directly.` })
  if (!sent) return say(502, { fallback: true, message: 'The message could not be sent just now.' })
  return say(200, { ok: true })
}
