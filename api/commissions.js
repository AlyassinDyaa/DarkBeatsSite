import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { adminOk } from './_session.js'
import { SITE, checkCode, discountCents } from './_orders.js'
import { db } from './_db.js'
import { checkPassword, clean, currentUser, fromThisSite, newId, noteTry, sendMail, siteUrl, tooMany } from './_users.js'
import {
  SETTINGS, STAGE_SETS, STATUS_WORDS, WORK_STAGES, stagesOf, cents, cleanLinks, cleanText, closePending, col, dbReady, dueWords, forAdmin, forCustomer, isOpen, isPaid, kinds,
  addMessage, mailArtistMessage, mailArtistRequest, mailCustomer, message, nextNumber, noteMailed, paidByPaypal, paypal, paypalSandbox, price, quoteBox,
  commissionsOpen, requestsOn, copyBox, isClosed, mailArtistReceived, shopSettings, stripe, titleFrom, artistName, currencyNow, quoteCurrencies,
} from './_commissions.js'

// customer accounts, as Shop → Shop settings has them: commissions need them (off: asked for by email)
const accountsMode = () => { const a = shopSettings().accounts; return ['optional', 'required'].includes(a) ? a : 'off' }
const brandName = () => { try { return JSON.parse(readFileSync(join(process.cwd(), 'content/site/brand.json'), 'utf8')).name || 'JBeatsArt' } catch { return 'JBeatsArt' } }

/* Commissions, for the customer and for the admin. One function for all of it (Vercel's plan
   allows 12), chosen by `action`, always POST. What is kept is described in api/_commissions.js.

   The customer (logged in; customer accounts must be on):
     { action: 'request', kind, idea, refs, size, budget, due }   a new commission; the artist is emailed
                                                                 (only while commissions are open)
     { action: 'list' }                                          theirs, newest first
     { action: 'get', id }                                       one, with its thread (marks it read)
     { action: 'message', id, text, links }                      a message to the artist
     { action: 'pay', id, provider: 'card' | 'paypal' }          accept the quote: answers { url } of the payment page
     { action: 'capture', id, order }                            back from PayPal: the payment is taken
     { action: 'cancel', id }                                    while it is not paid
     { action: 'confirm', id }                                   "I've received it": delivered becomes complete,
                                                                 and the conversation closes
     { action: 'remove', ids, password }                         out of their account, after a copy of each is
                                                                 emailed (nothing goes if it cannot be sent): an
                                                                 unpaid one is cancelled and deleted, a paid one
                                                                 only leaves their account (the artist keeps it)
     'pay' also takes `code`: a discount code, checked again here (a reward code only for its owner)
   The admin (Orders → Commissions; their pass, or this computer while developing):
     { action: 'adminList' }  { action: 'adminGet', id }  { action: 'adminMessage', id, text, links }
     { action: 'adminQuote', id, price, includes, due, ship }
     { action: 'adminStage', id, status: sketch | inks | colours | delivered | cancelled, note }
     { action: 'adminDelete', id }
     { action: 'adminReopen', id }                               a completed one back to delivered (they are told)
     { action: 'adminFileChunk', id, upload, file, name, type, index, total, data }   a piece of a finished file
     { action: 'adminDeliver', id, upload, note, link }          the finished files emailed to the customer
   Stripe's payments arrive through api/stripe-webhook.js (metadata kind = commission), which marks
   the commission paid and never records it as a shop order. */
const ID = /^c_[a-f0-9]{24}$/
const say = (res, status, body) => res.status(status).json(body)
const origin = (req) => `${req.headers['x-forwarded-proto'] || (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(req.headers.host || '')) ? 'http' : 'https')}://${req.headers.host}`
const back = (req, id, extra = '') => `${origin(req)}/account?tab=orders&view=commissions&c=${encodeURIComponent(id)}${extra}`

/* ---------- the admin ---------- */
const adminAction = async (req, action, body) => {
  const c = await col()
  const site = siteUrl(req)
  if (action === 'adminList') {
    const list = await c.find({ adminRemoved: { $ne: true } }).sort({ updatedAt: -1 }).limit(1000).toArray()
    return [200, { commissions: list.map((x) => forAdmin(x)), stages: WORK_STAGES, settings: { currency: currencyNow(), currencies: quoteCurrencies(), ship: SETTINGS.shipByDefault } }]
  }
  const id = String(body.id || '')
  if (!ID.test(id)) return [400, { message: 'Which commission?' }]
  const found = await c.findOne({ _id: id })
  if (!found) return [404, { message: 'That commission is not there any more.' }]

  if (action === 'adminGet') {
    if (found.unread && found.unread.artist) await c.updateOne({ _id: id }, { $set: { 'unread.artist': 0 } })
    return [200, { commission: forAdmin({ ...found, unread: { ...(found.unread || {}), artist: 0 } }, true) }]
  }

  if (action === 'adminMessage') {
    if (isClosed(found)) return [409, { message: found.status === 'complete' ? 'This commission is complete: the customer confirmed they received it, so the conversation is closed. Reopen it to write.' : 'This commission was cancelled: the conversation is closed.' }]
    const textValue = cleanText(body.text)
    const links = cleanLinks(body.links)
    if (!textValue && !links.length) return [400, { message: 'Write something first.' }]
    if ((found.messages || []).length >= SETTINGS.maxMessages) return [409, { message: 'This conversation is full. Carry on by email.' }]
    const msg = message('artist', textValue, links)
    const { after, quiet } = await addMessage(id, msg, { forSide: 'customer', set: found.status === 'requested' ? { status: 'discussing' } : {} })
    if (!quiet) {
      await mailCustomer(after, site, {
        subject: `A message about your commission ${after.number}`,
        title: `A message from ${artistName()}`,
        lines: [`About "${after.title}":`, ...(textValue ? textValue.split(/\n{2,}/) : []), ...(links.length ? [`Links: ${links.join(' ')}`] : [])],
        label: 'Answer in your account',
      })
      await noteMailed(id, 'customer')
    }
    return [200, { commission: forAdmin({ ...after, unread: { ...(after.unread || {}), artist: 0 } }, true) }]
  }

  if (action === 'adminQuote') {
    if (isPaid(found)) return [409, { message: 'It is paid already: the quote cannot change.' }]
    if (found.status === 'cancelled') return [409, { message: 'It was cancelled. Nothing to quote.' }]
    const amount = Math.round((Number(body.price) || 0) * 100) / 100
    if (!(amount >= 1) || amount > 100000) return [400, { message: 'Put a price between 1 and 100000.', field: 'price' }]
    const includes = cleanText(body.includes, 1000)
    if (!includes) return [400, { message: 'Say what the price includes.', field: 'includes' }]
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(body.due || '')) ? String(body.due) : ''
    const stages = String(body.stages || '')
    if (!STAGE_SETS[stages]) return [400, { message: 'Pick what the piece goes through.', field: 'stages' }]
    // the currency picked with the quote, or the shop's own (Shop → Shop settings)
    const asked = String(body.currency || '').trim().toUpperCase()
    if (asked && !quoteCurrencies().includes(asked)) return [400, { message: 'Pick one of the currencies offered.', field: 'currency' }]
    const quote = { price: amount, currency: asked || currencyNow(), includes, due, ship: Boolean(body.ship), stages, at: new Date() }
    // a checkout already opened at the old price is closed first
    await closePending(found)
    // the note in the thread carries the quote itself, so both sides show it as a quote card
    const note = { ...message('system', `Quote: ${price(amount, quote.currency)} · ${includes}${due ? ` · ready by ${dueWords(due)}` : ''} · ${quote.ship ? 'posted to you' : 'digital'}`), kind: 'quote', quote }
    const { after } = await addMessage(id, note, { forSide: 'customer', set: { quote, status: 'quoted', pending: null } })
    await mailCustomer(after, site, {
      subject: `Your commission quote is ready: ${after.number}`,
      kicker: 'Your quote',
      title: 'Your commission quote is ready',
      lines: [`Here is the quote for "${after.title}". Accept it and pay from your account, and the work starts. Questions first? Answer there, or reply to this email.`],
      orders: [quoteBox(after)],
      label: 'See the quote',
    })
    await noteMailed(id, 'customer')
    return [200, { commission: forAdmin({ ...after, unread: { ...(after.unread || {}), artist: 0 } }, true) }]
  }

  if (action === 'adminStage') {
    const status = String(body.status || '')
    if (!WORK_STAGES.includes(status)) return [400, { message: 'Unknown stage.' }]
    if (found.status === 'complete') return [409, { message: 'It is complete (the customer has it): reopen the conversation first.' }]
    if (status !== 'cancelled' && !isPaid(found)) return [409, { message: 'It is not paid yet: the work stages start once it is.' }]
    if (status !== 'cancelled' && !stagesOf(found).includes(status)) return [400, { message: `This piece does not go through ${STATUS_WORDS[status]}: the quote says ${stagesOf(found).map((k) => STATUS_WORDS[k]).join(' → ')}.` }]
    if (status === found.status) return [409, { message: `It is at ${STATUS_WORDS[status]} already.` }]
    const note = cleanText(body.note, 2000)
    const words = { sketch: 'The sketch is under way', inks: 'On to the inks', colours: 'On to the colours', delivered: 'Delivered', cancelled: 'Cancelled by the artist' }
    if (status === 'cancelled') await closePending(found)
    const { after } = await addMessage(id, message('system', `${words[status]}${note ? `: ${note}` : '.'}`), { forSide: 'customer', set: { status, ...(status === 'cancelled' ? { pending: null } : {}) } })
    const lines = {
      sketch: `${artistName()} has started the sketch of your commission.`,
      inks: 'The sketch is done and your commission is being inked.',
      colours: 'The inks are done: your commission is getting its colours.',
      delivered: after.quote && after.quote.ship ? 'Your commission is finished and on its way to you.' : 'Your commission is finished and delivered.',
      cancelled: isPaid(after) ? `Your commission has been cancelled. ${artistName()} will be in touch about the payment.` : 'Your commission has been cancelled.',
    }
    await mailCustomer(after, site, {
      subject: status === 'cancelled' ? `Your commission ${after.number} was cancelled` : `Your commission ${after.number}: ${STATUS_WORDS[status]}`,
      title: status === 'cancelled' ? 'Commission cancelled' : status === 'delivered' ? 'Your commission is done' : `${STATUS_WORDS[status]} under way`,
      lines: [lines[status], ...(note ? [note] : [])],
    })
    await noteMailed(id, 'customer')
    return [200, { commission: forAdmin({ ...after, unread: { ...(after.unread || {}), artist: 0 } }, true) }]
  }

  if (action === 'adminReopen') {
    // a completed commission opened again (the customer is told): back to delivered, the conversation open
    if (found.status !== 'complete') return [409, { message: 'Only a completed commission can be reopened.' }]
    const { after } = await addMessage(id, message('system', `${artistName()} reopened the conversation.`), { forSide: 'customer', set: { status: 'delivered', completedAt: null } })
    await mailCustomer(after, site, {
      subject: `Your commission ${after.number}: the conversation is open again`,
      title: 'The conversation is open again',
      lines: [`${artistName()} reopened the conversation about "${after.title}". You can write to each other in your account again.`],
      label: 'Open the conversation',
    })
    return [200, { commission: forAdmin({ ...after, unread: { ...(after.unread || {}), artist: 0 } }, true) }]
  }

  /* The finished piece, sent to the customer by email. The admin's browser sends each file in pieces
     (adminFileChunk, about 3 MB each, base64: a request may carry 4.5 MB on Vercel), kept for a day at
     most in `deliveryChunks`; adminDeliver puts them back together, emails them as attachments
     (20 MB at most, all together: a download link is for anything bigger), marks it delivered, and
     notes it in the conversation. Only once it is paid. */
  if (action === 'adminFileChunk' || action === 'adminDeliver') {
    if (!isPaid(found)) return [409, { message: 'It is not paid yet: the finished piece goes once it is.' }]
    if (found.status === 'cancelled') return [409, { message: 'It was cancelled.' }]
    const upload = String(body.upload || '')
    if (!/^[a-z0-9]{8,40}$/i.test(upload)) return [400, { message: 'That upload is not one of ours.' }]
    const chunks = (await db()).collection('deliveryChunks')
    if (action === 'adminFileChunk') {
      await chunks.deleteMany({ createdAt: { $lt: new Date(Date.now() - 864e5) } }) // anything left over from a day ago
      const file = Math.round(Number(body.file) || 0)
      const index = Math.round(Number(body.index))
      const total = Math.round(Number(body.total))
      const data = String(body.data || '')
      if (!(file >= 0 && file < 50 && total >= 1 && total <= 20 && index >= 0 && index < total)) return [400, { message: 'That piece of the file is not in order.' }]
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length > Math.ceil(SETTINGS.deliveryChunk / 3) * 4 + 8) return [400, { message: 'That piece of the file is not right. Try again.' }]
      const size = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
      const others = await chunks.find({ upload, commission: id }).toArray()
      const sofar = others.filter((x) => !(x.file === file && x.index === index)).reduce((n, x) => n + (x.size || 0), 0)
      if (sofar + size > SETTINGS.deliveryCap) return [413, { message: `Together the files are over ${SETTINGS.deliveryCap / 1048576} MB, too big for an email. Put them in Google Drive or WeTransfer and send the download link instead (or with fewer files).` }]
      await chunks.deleteMany({ upload, commission: id, file, index })
      await chunks.insertOne({ _id: `${upload}:${file}:${index}`, upload, commission: id, file, index, total, name: clean(body.name, 150) || `file-${file + 1}`, type: clean(body.type, 100), size, data, createdAt: new Date() })
      return [200, { ok: true, received: sofar + size }]
    }
    // adminDeliver: the files put back together, and sent
    const note = cleanText(body.note, 2000)
    const link = String(body.link || '').trim() ? cleanLinks([body.link])[0] || '' : ''
    if (String(body.link || '').trim() && !link) return [400, { field: 'link', message: 'That download link does not look like a web address (https://…).' }]
    const pieces = await chunks.find({ upload, commission: id }).toArray()
    const files = []
    for (const f of [...new Set(pieces.map((x) => x.file))].sort((a, b) => a - b)) {
      const parts = pieces.filter((x) => x.file === f).sort((a, b) => a.index - b.index)
      const total = parts[0].total
      if (parts.length !== total || parts.some((x, i) => x.index !== i)) return [409, { message: `${parts[0].name} did not arrive whole. Send it again.` }]
      files.push({ filename: parts[0].name, contentType: parts[0].type || undefined, content: Buffer.concat(parts.map((x) => Buffer.from(x.data, 'base64'))) })
    }
    if (!files.length && !link) return [400, { message: 'Add the finished files, or a download link.' }]
    const bytes = files.reduce((n, f) => n + f.content.length, 0)
    if (bytes > SETTINGS.deliveryCap) return [413, { message: `Together the files are over ${SETTINGS.deliveryCap / 1048576} MB, too big for an email. Send a download link instead.` }]
    const names = files.map((f) => f.filename)
    const sent = await mailCustomer(found, site, {
      subject: `Your commission ${found.number} is here`,
      kicker: 'Delivered',
      title: 'Your commission is here',
      lines: [
        `"${found.title}" is finished.${files.length ? ` ${files.length === 1 ? 'The file is' : `The ${files.length} files are`} attached to this email: ${names.join(', ')}.` : ''}`,
        ...(note ? note.split(/\n{2,}/) : []),
        ...(link ? [`Download it here: ${link}`] : []),
        'Once you have it, press "I\u2019ve received it" in your account.',
      ],
      label: 'See your commission',
      attachments: files,
    })
    if (!sent) return [502, { message: 'The email could not be sent just now. Nothing was marked delivered: try again in a moment (the files are kept for a day).' }]
    const words = `Delivered: ${files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'} sent to your email (${names.join(', ')})` : 'sent to your email'}${link ? `. Download link: ${link}` : ''}${note ? `. ${note}` : ''}`
    const set = found.status !== 'complete' && stagesOf(found).includes('delivered') ? { status: 'delivered', deliveredAt: new Date() } : { deliveredAt: new Date() }
    const { after } = await addMessage(id, message('system', words, link ? [link] : []), { forSide: 'customer', set })
    await chunks.deleteMany({ upload, commission: id })
    return [200, { commission: forAdmin({ ...after, unread: { ...(after.unread || {}), artist: 0 } }, true), sent: names }]
  }

  /* Deleting, as far as the admin picks in the delete window:
     'admin'      only out of the admin's list: the customer keeps it in their account (the conversation,
                  the quote, what they paid). Should they write in it, or pay its quote, it comes back.
     'everywhere' gone for both: with `copy`, the customer is first emailed a copy of it (the request,
                  the quote, the payment and the conversation); an open checkout for it is closed. */
  if (action === 'adminDelete') {
    if (body.scope !== 'everywhere') {
      await c.updateOne({ _id: id }, { $set: { adminRemoved: true, adminRemovedAt: new Date() } })
      return [200, { deleted: id, scope: 'admin' }]
    }
    let copied = null
    if (body.copy && found.email && !found.customerRemoved) {
      const first = String(found.name || '').split(' ')[0]
      copied = await sendMail({
        to: found.email,
        subject: `Your commission ${found.number}: a copy for your records`,
        kicker: 'Your commissions',
        title: 'A copy of your commission',
        lines: [`Hi${first ? ` ${first}` : ''},`, `Commission ${found.number} ("${found.title}") has been taken off our records and out of your account. Here is a copy to keep: the request, the quote, the payment and the whole conversation.`],
        orders: [copyBox(found)],
        after: 'Questions about it? Just reply to this email.',
        replyTo: process.env.CONTACT_TO || undefined,
      }).catch(() => false)
    }
    await closePending(found)
    await c.deleteOne({ _id: id })
    return [200, { deleted: id, scope: 'everywhere', copied }]
  }
  return [400, { message: 'Unknown action.' }]
}

/* ---------- the customer ---------- */
const customerAction = async (req, user, action, body) => {
  const c = await col()
  const site = siteUrl(req)

  if (action === 'request') {
    if (!requestsOn()) return [403, { closed: true, message: 'Commission requests are not taken on the site right now.' }]
    if (!commissionsOpen()) return [403, { closed: true, message: `Commissions are closed right now, so new requests cannot be sent. Check back soon, or write to ${artistName()}.` }]
    if (await tooMany(`commission:${user._id}`, 5, 24 * 60)) return [429, { message: 'You have sent a few requests today already. Add to one of them, or try again tomorrow.' }]
    const idea = cleanText(body.idea, 5000)
    if (idea.length < 2) return [400, { message: 'Tell me the idea.', field: 'idea' }]
    const offered = kinds()
    const kind = offered.includes(String(body.kind || '').trim()) ? String(body.kind).trim() : 'Something else'
    const refs = cleanLinks(body.refs)
    const details = { kind, idea, refs, size: clean(body.size, 120), budget: clean(body.budget, 120), due: clean(body.due, 120) }
    await noteTry(`commission:${user._id}`)
    const now = new Date()
    const doc = {
      _id: newId('c'), number: await nextNumber(user), userId: user._id, email: user.email, name: user.name || '',
      title: clean(body.title, 80) || titleFrom(kind, idea), details, status: 'requested', quote: null,
      messages: [{ from: 'customer', text: idea, links: refs, at: now }], unread: { customer: 0, artist: 1 },
      pending: null, payment: null, createdAt: now, updatedAt: now, mailed: { artist: now },
    }
    await c.insertOne(doc)
    await mailArtistRequest(doc, site)
    return [200, { commission: forCustomer(doc, true) }]
  }

  if (action === 'list') {
    const list = await c.find({ userId: user._id, customerRemoved: { $ne: true } }).sort({ createdAt: -1 }).limit(200).toArray()
    return [200, { commissions: list.map((x) => forCustomer(x)), unread: list.reduce((n, x) => n + ((x.unread && x.unread.customer) || 0), 0) }]
  }

  if (action === 'remove') {
    // like taking orders out of the account: the password, then a copy of each by email, then out
    if (await tooMany(`login:${user.email}`, 8, 15)) return [429, { message: 'Too many tries. Wait 15 minutes.' }]
    if (!(await checkPassword(body.password, user.password))) { await noteTry(`login:${user.email}`); return [400, { message: 'The password is not right.', field: 'password' }] }
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : [body.id]).map((x) => String(x || '')).filter((x) => ID.test(x)))].slice(0, 100)
    const going = ids.length ? await c.find({ _id: { $in: ids }, userId: user._id, customerRemoved: { $ne: true } }).limit(100).toArray() : []
    if (!going.length) return [404, { message: ids.length > 1 ? 'Those commissions are not in your account any more.' : 'That commission is not in your account any more.' }]
    const first = (user.name || '').split(' ')[0]
    const sent = await sendMail({
      to: user.email,
      subject: `Your commissions: a copy of ${going.length === 1 ? `commission ${going[0].number}` : `${going.length} commissions`}`,
      kicker: 'Your commissions',
      title: going.length === 1 ? 'A copy of your commission' : `A copy of ${going.length} commissions`,
      lines: [`Hi${first ? ` ${first}` : ''},`, `You took ${going.length === 1 ? 'this commission' : 'these commissions'} out of your account. Here is a copy to keep: the request, the quote, the payment and the whole conversation.`],
      orders: going.map(copyBox),
      after: 'Questions about a commission? Just reply to this email.',
    })
    if (!sent) return [502, { message: 'The copy could not be emailed just now, so nothing was taken out. Try again in a moment.' }]
    const dropped = []
    for (const x of going) {
      if (isPaid(x)) {
        // paid: it leaves their account; the artist keeps it, with a note
        await c.updateOne({ _id: x._id }, { $set: { customerRemoved: true, removedAt: new Date(), updatedAt: new Date() }, $push: { messages: message('system', 'The customer removed this commission from their account (a copy was emailed to them).') }, $inc: { 'unread.artist': 1 } })
      } else {
        // not paid: cancelled, and gone (an open checkout for it is closed first)
        await closePending(x)
        await c.deleteOne({ _id: x._id })
        dropped.push(x)
      }
    }
    if (dropped.length) await mailArtistMessage(dropped[0], { text: `${user.name || user.email} took ${dropped.length === 1 ? 'this request' : 'these requests'} out of their account before paying, so ${dropped.length === 1 ? 'it was' : 'they were'} cancelled: ${dropped.map((x) => `${x.number} (${x.title})`).join(', ')}.`, links: [] }, site, dropped.length === 1 ? 'A commission request was withdrawn' : 'Commission requests were withdrawn')
    return [200, { removed: going.map((x) => x._id) }]
  }

  const id = String(body.id || '')
  if (!ID.test(id)) return [400, { message: 'Which commission?' }]
  const found = await c.findOne({ _id: id, userId: user._id, customerRemoved: { $ne: true } })
  if (!found) return [404, { message: 'That commission is not in your account.' }]

  if (action === 'get') {
    if (found.unread && found.unread.customer) await c.updateOne({ _id: id }, { $set: { 'unread.customer': 0 } })
    return [200, { commission: forCustomer({ ...found, unread: { ...(found.unread || {}), customer: 0 } }, true), payWays: payWays() }]
  }

  if (action === 'message') {
    if (isClosed(found)) return [409, { message: found.status === 'complete' ? 'This commission is complete, so the conversation is closed. Want something new? Request a new commission.' : 'This commission was cancelled, so the conversation is closed.' }]
    if (await tooMany(`cmsg:${user._id}`, 40, 60)) return [429, { message: 'That is a lot of messages in an hour. Try again in a little while.' }]
    const textValue = cleanText(body.text)
    const links = cleanLinks(body.links)
    if (!textValue && !links.length) return [400, { message: 'Write something first.' }]
    if ((found.messages || []).length >= SETTINGS.maxMessages) return [409, { message: 'This conversation is full. Carry on by email.' }]
    await noteTry(`cmsg:${user._id}`)
    const msg = message('customer', textValue, links)
    const { after, quiet } = await addMessage(id, msg, { forSide: 'artist', set: { ...(found.status === 'requested' ? { status: 'discussing' } : {}), adminRemoved: false } })
    if (!quiet) { await mailArtistMessage(after, msg, site); await noteMailed(id, 'artist') }
    return [200, { commission: forCustomer({ ...after, unread: { ...(after.unread || {}), customer: 0 } }, true) }]
  }

  if (action === 'confirm') {
    // "I've received it": only once it is delivered; it is then complete and the conversation closes
    if (found.status !== 'delivered') return [409, { message: found.status === 'complete' ? 'You confirmed it already. Thank you!' : 'It is not delivered yet.' }]
    const { after } = await addMessage(id, message('system', 'Received — this commission is complete.'), { forSide: 'artist', set: { status: 'complete', completedAt: new Date() } })
    await mailArtistReceived(after, site)
    return [200, { commission: forCustomer({ ...after, unread: { ...(after.unread || {}), customer: 0 } }, true) }]
  }

  if (action === 'cancel') {
    if (!isOpen(found) || isPaid(found)) return [409, { message: `It is paid already, so it cannot be cancelled here. Write to ${artistName()} about it.` }]
    await closePending(found)
    const msg = message('system', 'Cancelled by the customer.')
    const { after } = await addMessage(id, msg, { forSide: 'artist', set: { status: 'cancelled', pending: null } })
    await mailArtistMessage(after, { text: `${after.name || after.email} cancelled the commission "${after.title}".`, links: [] }, site, 'A commission was cancelled')
    return [200, { commission: forCustomer(after, true) }]
  }

  if (action === 'pay') {
    if (isPaid(found)) return [409, { message: 'It is paid already. Thank you!' }]
    if (found.status !== 'quoted' || !found.quote) return [409, { message: 'There is no quote to pay yet.' }]
    const ways = payWays()
    const q = found.quote
    const name = `Commission ${found.number}: ${found.title}`.slice(0, 250)
    // a discount code from the quote card, checked again (a reward code works only for its owner)
    let deal = null
    if (String(body.code || '').trim()) {
      const got = await checkCode(body.code, user)
      if (!got.ok) return [400, { field: 'code', message: got.message }]
      deal = got
    }
    const total = cents(q.price * SETTINGS.upFront)
    const off = deal ? discountCents(total, deal.percent) : 0
    const amount = total - off
    const codeKept = deal ? { code: deal.code, promoId: deal.promoId, discount: off / 100 } : {}
    if (body.provider === 'paypal') {
      if (!ways.paypal) return [403, { message: 'PayPal is switched off. Pay by card instead.' }]
      if (amount <= 0) return [400, { field: 'code', message: 'A code that covers the whole price works with card payment: use the card button.' }]
      const value = (amount / 100).toFixed(2)
      const whole = (total / 100).toFixed(2)
      const order = {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'commission', custom_id: id, description: name.slice(0, 127),
          amount: { currency_code: q.currency, value, breakdown: { item_total: { currency_code: q.currency, value: whole }, ...(off ? { discount: { currency_code: q.currency, value: (off / 100).toFixed(2) } } : {}) } },
          items: [{ name: name.slice(0, 127), quantity: '1', unit_amount: { currency_code: q.currency, value: whole }, category: q.ship ? 'PHYSICAL_GOODS' : 'DIGITAL_GOODS', sku: found.number, ...(q.includes ? { description: q.includes.slice(0, 127) } : {}) }],
        }],
        payment_source: { paypal: { experience_context: {
          brand_name: brandName().slice(0, 127), user_action: 'PAY_NOW', shipping_preference: q.ship ? 'GET_FROM_FILE' : 'NO_SHIPPING',
          return_url: back(req, id, '&paypal=return'), cancel_url: back(req, id),
        } } },
      }
      try {
        const made = await paypal('/v2/checkout/orders', order)
        const go = (made.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve')
        if (!go) throw new Error('paypal: no approval link')
        await c.updateOne({ _id: id }, { $set: { pending: { provider: 'paypal', ref: made.id, amount: amount / 100, ...codeKept, test: paypalSandbox(), at: new Date() } } })
        return [200, { url: go.href }]
      } catch (e) {
        console.error('commission paypal:', e.message)
        return [e.status === 401 ? 503 : 502, { message: 'PayPal could not be opened. Try again in a moment.' }]
      }
    }
    if (!ways.card) return [403, { message: 'Card payment is switched off. Pay with PayPal instead.' }]
    const ask = new URLSearchParams()
    ask.set('mode', 'payment')
    ask.set('success_url', back(req, id, '&paid=1'))
    ask.set('cancel_url', back(req, id))
    ask.set('line_items[0][quantity]', '1')
    ask.set('line_items[0][price_data][currency]', q.currency.toLowerCase())
    ask.set('line_items[0][price_data][unit_amount]', String(total))
    // the code, applied on Stripe's page; the webhook reads it back from the metadata
    if (deal) {
      ask.set('discounts[0][promotion_code]', deal.promoId)
      ask.set('metadata[code]', deal.code)
      ask.set('payment_intent_data[metadata][code]', deal.code)
    }
    ask.set('line_items[0][price_data][product_data][name]', name)
    if (q.includes) ask.set('line_items[0][price_data][product_data][description]', q.includes.slice(0, 500))
    // this site's checkout, and a commission (not a shop order): see api/stripe-webhook.js
    for (const [k, v] of [['site', SITE], ['kind', 'commission'], ['commission', id], ['number', found.number]]) {
      ask.set(`metadata[${k}]`, v)
      ask.set(`payment_intent_data[metadata][${k}]`, v)
    }
    ask.set('client_reference_id', user._id)
    ask.set('customer_email', user.email)
    if (q.ship) {
      const shop = shopSettings()
      const countries = (Array.isArray(shop.countries) ? shop.countries : []).map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x))
      ;(countries.length ? countries : ['AU']).forEach((x, i) => ask.set(`shipping_address_collection[allowed_countries][${i}]`, x))
    }
    try {
      const got = await stripe('checkout/sessions', ask)
      if (!got.ok || !got.said.url) {
        console.error('stripe refused the commission checkout:', got.status, got.said && got.said.error && got.said.error.message)
        return [502, { message: 'The checkout could not be opened. Try again in a moment.' }]
      }
      await c.updateOne({ _id: id }, { $set: { pending: { provider: 'stripe', ref: got.said.id, amount: amount / 100, ...codeKept, test: !got.said.livemode, at: new Date() } } })
      return [200, { url: got.said.url }]
    } catch {
      return [502, { message: 'Could not reach the payment service. Try again in a moment.' }]
    }
  }

  if (action === 'capture') {
    // back from PayPal: only the order opened for this quote is taken
    const order = String(body.order || '')
    if (!/^[A-Z0-9]{8,32}$/.test(order)) return [400, { message: 'That is not a PayPal order.' }]
    if (isPaid(found)) return [200, { ok: true, commission: forCustomer(found, true) }] // a reload of the page
    if (!found.pending || found.pending.provider !== 'paypal' || found.pending.ref !== order) return [409, { message: 'That payment is for an older quote. Nothing was charged: open the quote again.' }]
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return [503, { message: 'PayPal is not set up.' }]
    try {
      const done = await paypal(`/v2/checkout/orders/${order}/capture`)
      if (done.status !== 'COMPLETED') return [502, { message: 'PayPal did not finish the payment. Nothing was charged: try again.' }]
      const after = (await paidByPaypal(id, order, done, site, found.pending)) || (await c.findOne({ _id: id }))
      return [200, { ok: true, commission: forCustomer(after, true) }]
    } catch (e) {
      if (e.issue === 'ORDER_ALREADY_CAPTURED') return [200, { ok: true, commission: forCustomer((await c.findOne({ _id: id })) || found, true) }]
      console.error('commission paypal capture:', e.message)
      return [502, { message: e.issue === 'INSTRUMENT_DECLINED' ? 'PayPal declined that payment. Try another card or account.' : 'PayPal could not take the payment. Nothing was charged: try again in a moment.' }]
    }
  }
  return [400, { message: 'Nothing to do.' }]
}

// the ways to pay, as Shop → Settings & payments has them, and only those set up
const payWays = () => {
  const p = shopSettings().payments || 'stripe'
  return {
    card: (p === 'stripe' || p === 'both') && Boolean(process.env.STRIPE_SECRET_KEY),
    paypal: (p === 'paypal' || p === 'both') && Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
  }
}

/* ---------- live: a conversation as it happens ----------
   GET /api/commissions?stream=<id>           the customer's own commission (their login cookie)
   GET /api/commissions?stream=<id>&admin=1   the admin's (their pass in the Authorization header, as
                                              for everything else: the page reads this with fetch, so no
                                              secret ever goes in an address)
   Server-Sent Events: the commission once, as `get` / `adminGet` answer it, then again every time it
   changes (a MongoDB change stream on that one document), a comment every 15 seconds so nothing
   between closes it, and `bye` after 50 seconds (Vercel ends a function after 60): the page opens it
   again. Watching marks it read for that side, as opening it does. A database that cannot watch (the
   stand-in on this computer, or a plan without change streams) says `fallback` and the page asks
   every few seconds instead. */
export const STREAM = { life: 50000, beat: 15000 }
const queryOf = (req) => {
  try { return new URL(req.url || '/', 'http://site').searchParams } catch { return new URLSearchParams() }
}
const streamCommission = async (req, res, q) => {
  const id = String(q.get('stream') || '')
  const admin = q.get('admin') === '1'
  if (!ID.test(id)) return say(res, 400, { message: 'Which commission?' })
  if (!dbReady()) return say(res, 503, { message: 'Commissions need the database, which is not set up yet.' })
  let user = null
  if (admin) {
    if (!adminOk(req)) return say(res, 401, { message: 'Your login has run out. Sign out of the admin and sign in again.' })
  } else {
    if (accountsMode() === 'off') return say(res, 403, { message: 'Accounts are switched off.' })
    user = await currentUser(req)
    if (!user) return say(res, 401, { login: true, message: 'Log in first.' })
  }
  const c = await col()
  const theirs = (doc) => Boolean(doc) && (admin || (doc.userId === user._id && !doc.customerRemoved))
  const first = await c.findOne({ _id: id })
  if (!theirs(first)) return say(res, 404, { message: 'That commission is not there any more.' })
  const side = admin ? 'artist' : 'customer'
  const shape = (doc) => (admin
    ? { commission: forAdmin({ ...doc, unread: { ...(doc.unread || {}), artist: 0 } }, true) }
    : { commission: forCustomer({ ...doc, unread: { ...(doc.unread || {}), customer: 0 } }, true), payWays: payWays() })

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // nothing in between holds it back
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  let open = true
  let watcher = null
  let beat = 0
  let life = 0
  let done = () => {}
  const finished = new Promise((resolve) => { done = resolve })
  const stop = () => {
    if (!open) return
    open = false
    clearInterval(beat); clearTimeout(life)
    if (watcher) { try { Promise.resolve(watcher.close()).catch(() => {}) } catch { /* closed already */ } }
    try { res.end() } catch { /* the visitor left */ }
    done()
  }
  const write = (text) => {
    if (!open) return
    try { res.write(text); if (typeof res.flush === 'function') res.flush() } catch { stop() }
  }
  const send = (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  // seen by this side: their unread count back to nothing (only when it is not already)
  const seen = async (doc) => { if (doc && doc.unread && doc.unread[side] > 0) { try { await c.updateOne({ _id: id }, { $set: { [`unread.${side}`]: 0 } }) } catch { /* next time */ } } }
  if (typeof res.on === 'function') res.on('close', stop) // the page went away, or reconnects

  send('commission', shape(first))
  await seen(first)
  beat = setInterval(() => write(': still here\n\n'), STREAM.beat)
  life = setTimeout(() => { send('bye', { reconnect: true }); stop() }, STREAM.life)
  const fallback = (why) => { if (!open) return; console.warn('commission stream: no change stream,', why); send('fallback', { reason: 'This database cannot send changes as they happen.' }); stop() }
  try {
    if (typeof c.watch !== 'function') throw new Error('no watch() on this database')
    watcher = c.watch([{ $match: { 'documentKey._id': id } }], { fullDocument: 'updateLookup' })
    watcher.on('change', async (change) => {
      if (!open) return
      if (change.operationType === 'delete') { send('gone', {}); return stop() }
      const doc = change.fullDocument || (await c.findOne({ _id: id }))
      if (!theirs(doc)) { send('gone', {}); return stop() }
      send('commission', shape(doc))
      await seen(doc)
    })
    watcher.on('error', (e) => fallback(e && e.message))
  } catch (e) { fallback(e && e.message) }
  return finished
}

export default async function handler(req, res) {
  // a conversation, live (Server-Sent Events): see above
  if (req.method === 'GET') {
    const q = queryOf(req)
    if (q.get('stream')) {
      try { return await streamCommission(req, res, q) } catch (e) {
        console.error('commission stream:', e && e.message)
        if (!res.headersSent) return say(res, 500, { message: 'Something went wrong on our side.' })
        try { res.end() } catch { /* gone */ }
        return undefined
      }
    }
  }
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return say(res, 405, { message: 'Use POST.' })
  if (!dbReady()) return say(res, 503, { message: 'Commissions need the database, which is not set up yet.' })
  if (!fromThisSite(req)) return say(res, 403, { message: 'That request did not come from this site.' })
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const action = String(body.action || '')
  try {
    if (action.startsWith('admin')) {
      if (!adminOk(req)) return say(res, 401, { message: 'Your login has run out. Sign out of the admin and sign in again.' })
      return say(res, ...(await adminAction(req, action, body)))
    }
    if (accountsMode() === 'off') return say(res, 403, { message: 'Accounts are switched off, so commissions are asked for by email.' })
    const user = await currentUser(req)
    if (!user) return say(res, 401, { login: true, message: 'Log in or make an account to request a commission.' })
    return say(res, ...(await customerAction(req, user, action, body)))
  } catch (e) {
    console.error('commissions:', e && e.message)
    return say(res, 500, { message: 'Something went wrong on our side. Try again in a moment.' })
  }
}
