import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAccount } from '../hooks/useAccount'
import { brand, money, shop } from '../data/site'

// the artist's first name, in the conversation and the words around it
const ARTIST = String(brand.artist || brand.name || 'the artist').trim().split(/\s+/)[0]
// a small padlock, as beside the shop's checkout buttons
const Lock = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10.5h12v9.5H6z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
// PayPal's button, as in the cart
function PaypalButton({ busy, onClick }) {
  return (
    <button type="button" className={`buy-btn is-paypal ${busy ? 'is-busy' : ''}`} onClick={onClick} aria-busy={busy} disabled={busy}>
      <span className="buy-btn-label">{busy ? 'Opening PayPal' : 'Pay with PayPal'}</span>
      <span className="buy-btn-icon" aria-hidden="true">{busy ? <i className="buy-spin" /> : '→'}</span>
    </button>
  )
}

/* The customer's commissions, under Orders in their account (api/commissions.js): a list, and
   each one opened with where it is up to, the conversation with the artist, the quote to accept
   and pay, and the payment once made. What is open is in the address (?view=commissions&c=<id>),
   so an emailed link lands on it. Asked again every 20 seconds while a commission is open. */

// one commission action; answers what the server said, or throws with its message
export async function askCommissions(action, data = {}) {
  const answer = await fetch('/api/commissions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) })
  const said = await answer.json().catch(() => ({}))
  if (!answer.ok) { const e = new Error(said.message || 'Something went wrong. Try again in a moment.'); e.status = answer.status; e.field = said.field || ''; throw e }
  return said
}

/* A live conversation (api/commissions.js ?stream=): Server-Sent Events read with fetch, so the
   login cookie goes with it and nothing secret is put in the address. Calls onEvent(name, data)
   for each event; ends when the server closes it (it does after 50 seconds: open it again). */
export async function readStream(url, signal, onEvent, headers = {}) {
  const answer = await fetch(url, { headers: { Accept: 'text/event-stream', ...headers }, cache: 'no-store', credentials: 'same-origin', signal })
  if (!answer.ok || !answer.body) throw new Error(`stream ${answer.status}`)
  const reader = answer.body.getReader()
  const decoder = new TextDecoder()
  let held = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    held += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let at
    while ((at = held.indexOf('\n\n')) >= 0) {
      const block = held.slice(0, at)
      held = held.slice(at + 2)
      let event = 'message'
      const data = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (!data.length) continue // a comment, to keep the line open
      try { onEvent(event, JSON.parse(data.join('\n'))) } catch { /* not ours */ }
    }
  }
}
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const keyOf = (c) => `${(c.messages || []).length}:${c.status}:${c.updatedAt || ''}`

/* The list, for the whole account page (the tab's count of unread messages): asked on arrival,
   on coming back to the page, and every minute. */
export function useCommissionList(on = true) {
  const [list, setList] = useState(null)
  const [unread, setUnread] = useState(0)
  const reload = useCallback(() => askCommissions('list').then((s) => { setList(s.commissions || []); setUnread(s.unread || 0) }).catch(() => setList((l) => l || [])), [])
  useEffect(() => {
    if (!on) return undefined
    reload()
    const back = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', back)
    const every = setInterval(back, 60000)
    return () => { clearInterval(every); document.removeEventListener('visibilitychange', back) }
  }, [on, reload])
  return { list, unread, reload }
}

export const STEPS = [['requested', 'Requested'], ['discussing', 'Discussing'], ['quoted', 'Quoted'], ['paid', 'Paid'], ['sketch', 'Sketch'], ['inks', 'Inks'], ['colours', 'Colours'], ['delivered', 'Delivered']]
const WORDS = { ...Object.fromEntries(STEPS), complete: 'Received', cancelled: 'Cancelled' }
// what a piece goes through once paid (the quote's stages): a sketch skips inks and colours, an inked piece the colours
const SETS = { sketch: ['sketch', 'delivered'], inks: ['sketch', 'inks', 'delivered'], full: ['sketch', 'inks', 'colours', 'delivered'] }
const workOf = (stages) => (Array.isArray(stages) && stages.length ? stages : SETS[stages] || SETS.full)
// after delivery, the last step is theirs: they say they received it
const stepsFor = (stages) => [...STEPS.slice(0, 4), ...workOf(stages).map((k) => [k, WORDS[k]]), ['complete', 'Received']]
const stagesWords = (stages) => workOf(stages).map((k) => WORDS[k]).join(' → ')
// a currency other than the shop's says which ("$180 USD")
const HOME = String(shop.currency || 'aud').toUpperCase()
const priced = (n, code) => { const c = String(code || HOME).toUpperCase(); try { const s = new Intl.NumberFormat('en-AU', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(n); return c === HOME ? s : `${s} ${c}` } catch { return money(n) } }
const longDay = (d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
const dueDay = (d) => { const t = new Date(d); return Number.isNaN(+t) ? String(d) : t.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }
const when = (d) => {
  const t = new Date(d)
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24 && t.toDateString() === new Date().toDateString()) return t.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  return t.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + `, ${t.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
}

// words with their web addresses as links
const URL_RE = /(https?:\/\/[^\s<>"]+)/g
export function Linked({ text }) {
  return String(text || '').split(URL_RE).map((part, i) => (i % 2 ? <a key={i} href={part} target="_blank" rel="noreferrer nofollow">{part.replace(/^https?:\/\//, '').slice(0, 60)}{part.length > 68 ? '…' : ''}</a> : part))
}

/* Taking commissions out of the account (one, or several chosen at once), as with shop orders:
   only with the password, and only once a copy of each (the request, the quote, the payment and
   the conversation) has been emailed to them. Not paid yet: cancelled and gone. Paid: it leaves
   their account, and the artist keeps it. */
function RemoveCommissions({ items = [], onClose, onRemoved }) {
  const { user } = useAccount()
  const open = items.length > 0
  const box = useRef(null)
  const pwId = useId()
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState({ text: '', field: '' })
  useEffect(() => {
    if (!open) return undefined
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    addEventListener('keydown', key)
    const t = setTimeout(() => box.current?.querySelector('input')?.focus(), 60)
    window.__lenis?.stop?.()
    return () => { removeEventListener('keydown', key); clearTimeout(t); window.__lenis?.start?.(); before?.focus?.() }
  }, [open, onClose, busy])
  useEffect(() => { if (!open) { setPassword(''); setProblem({ text: '', field: '' }) } }, [open])
  const one = items.length === 1
  const paid = items.filter((c) => c.paid).length
  const unpaid = items.length - paid
  const submit = async (e) => {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true); setProblem({ text: '', field: '' })
    try { await askCommissions('remove', { ids: items.map((c) => c.id), password }); setPassword(''); onRemoved(items) } catch (err) { setProblem({ text: err.message, field: err.field || '' }) }
    setBusy(false)
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="acc-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
          <motion.form ref={box} className="acc-modal-box lined" role="alertdialog" aria-modal="true" aria-labelledby="acc-cdel-title" aria-describedby="acc-cdel-text" noValidate onSubmit={submit}
            initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
            <button type="button" className="acc-modal-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
            <span className="acc-modal-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6" /></svg></span>
            <h2 id="acc-cdel-title">{one ? `Delete commission ${items[0].number}?` : `Delete ${items.length} commissions?`}</h2>
            <div id="acc-cdel-text" className="acc-del-text">
              {!one && <ul className="acc-del-list">{items.map((c) => <li key={c.id}><b>{c.number}</b><small>{c.title} · {WORDS[c.status] || c.status}</small></li>)}</ul>}
              <p className="acc-del-warn"><b>This cannot be undone.</b> {one ? 'It leaves' : 'They leave'} your account for good: the conversation, the quote and the stages will no longer show here.</p>
              {unpaid > 0 && <p>{one ? 'It is not paid, so the request is cancelled too' : unpaid === items.length ? 'None of them is paid, so the requests are cancelled too' : `${unpaid} of them ${unpaid === 1 ? 'is' : 'are'} not paid: ${unpaid === 1 ? 'that request is' : 'those requests are'} cancelled too`}, and {ARTIST} is told.</p>}
              {paid > 0 && <p>{one ? 'It is paid, so' : paid === items.length ? 'They are paid, so' : `${paid} of them ${paid === 1 ? 'is' : 'are'} paid:`} {ARTIST} keeps {paid === 1 ? 'it' : 'them'} on their side and the work carries on. {paid === 1 ? 'It' : 'They'} will no longer count toward your rewards.</p>}
              <p className="acc-del-copy"><span aria-hidden="true">✉</span> First, a copy of {one ? 'it' : 'each'} (the request, the quote, the payment and the whole conversation) is emailed to you at <b>{user.email}</b>. If the copy cannot be sent, nothing is deleted.</p>
              <p>Type your password to be sure.</p>
            </div>
            <div className="acc-modal-field">
              <div className={`field acc-field ${problem.field === 'password' ? 'has-error' : ''}`}>
                <input id={pwId} type={shown ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder=" " required aria-required="true" autoComplete="current-password" maxLength={200} aria-invalid={problem.field === 'password'} aria-describedby={problem.field === 'password' ? `${pwId}-note` : undefined} />
                <label htmlFor={pwId}>Your password <span className="cmr-req" aria-hidden="true">*</span></label>
                <span className="bar" />
                <button type="button" className="acc-eye" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide the password' : 'Show the password'} aria-pressed={shown}>{shown ? 'Hide' : 'Show'}</button>
                {problem.field === 'password' && <p id={`${pwId}-note`} className="acc-note is-error">{problem.text}</p>}
              </div>
            </div>
            {problem.text && problem.field !== 'password' && <p className="acc-problem" role="alert">{problem.text}</p>}
            <div className="acc-modal-actions">
              <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>Keep {one ? 'it' : 'them'}</button>
              <button type="submit" className="btn sm acc-modal-yes" disabled={busy || !password}>{busy ? 'Emailing the copy…' : one ? 'Delete and email me a copy' : `Delete ${items.length} and email me a copy`}</button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- the list ---------- */
function CommissionList({ list, open, reload }) {
  const { user } = useAccount()
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [removing, setRemoving] = useState([])
  const [done, setDone] = useState('')
  const close = useCallback(() => setRemoving([]), [])
  if (!list) return <p className="acc-wait">Fetching your commissions…</p>
  if (!list.length) return (
    <>
      {done && <p className="acc-welcome" role="status">{done}</p>}
      <div className="acc-empty">
        <strong>No commissions yet</strong>
        <p>Ask for a piece of your own on the Commissions page: you talk it over with {ARTIST} here, get a quote, and follow it from sketch to delivery.</p>
        <Link className="btn sm" to="/commissions#request">Request a commission <span className="arrow">→</span></Link>
      </div>
    </>
  )
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allPicked = list.every((c) => picked.has(c.id))
  const chosen = list.filter((c) => picked.has(c.id))
  const stop = () => { setPicking(false); setPicked(new Set()) }
  const removed = (items) => {
    setRemoving([]); stop()
    reload()
    setDone(`${items.length === 1 ? 'Deleted.' : `${items.length} commissions deleted.`} A copy is on its way to ${user.email}.`)
    setTimeout(() => setDone(''), 6000)
  }
  return (
    <>
      <div className="acc-otools">
        <span className="acc-ccount">{list.length} {list.length === 1 ? 'commission' : 'commissions'}</span>
        {!picking && <button type="button" className="acc-oselect" onClick={() => { setPicking(true); setDone('') }}>Select</button>}
      </div>
      {picking && (
        <div className="acc-opick" role="region" aria-label="Choose commissions to delete">
          <label className="acc-opick-all">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((c) => c.id)))} />
            <span aria-hidden="true" />
            Select all <small>{list.length}</small>
          </label>
          <span className="acc-opick-count">{picked.size ? `${picked.size} chosen` : 'Tick the commissions to delete'}</span>
          <button type="button" className="btn sm acc-modal-yes" disabled={!chosen.length} onClick={() => setRemoving(chosen)}>Delete{chosen.length ? ` ${chosen.length}` : ''}…</button>
          <button type="button" className="btn ghost sm" onClick={stop}>Cancel</button>
        </div>
      )}
      {done && <p className="acc-welcome" role="status">{done}</p>}
      <div className="acc-olist">
        {list.map((c) => (
          <div key={c.id} className="acc-crow-wrap">
            <button type="button" className={`acc-orow acc-crow ${c.unread ? 'is-unread' : ''} ${picking ? 'is-picking' : ''} ${picking && picked.has(c.id) ? 'is-picked' : ''}`} aria-pressed={picking ? picked.has(c.id) : undefined} onClick={() => (picking ? toggle(c.id) : open(c.id))}>
              {picking ? <span className="acc-orow-tick" aria-hidden="true" /> : <span className="acc-crow-no" aria-hidden="true">{c.number.replace(/^C-/, '')}</span>}
              <span className="acc-orow-what">
                <strong>{c.title}</strong>
                <small>{c.number} · {c.kind}{c.lastAt ? ` · ${when(c.lastAt)}` : ''}</small>
              </span>
              <span className={`acc-pill is-${c.status}`}>{WORDS[c.status] || c.status}</span>
              <b className="acc-orow-total">{c.price != null ? priced(c.price, c.currency) : '—'}</b>
              {c.unread > 0 ? <small className="acc-cbadge" aria-label={`${c.unread} new`}>{c.unread}</small> : <svg className="acc-orow-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>}
            </button>
            {!picking && (
              <button type="button" className="acc-order-del acc-crow-del" onClick={() => setRemoving([c])} title="Delete from your account" aria-label={`Delete commission ${c.number} from your account`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6" /></svg>
              </button>
            )}
          </div>
        ))}
      </div>
      <RemoveCommissions items={removing} onClose={close} onRemoved={removed} />
    </>
  )
}

/* ---------- one commission ---------- */
/* "Confirm you've received it?": a small window, asked once before it is complete. */
function ReceivedWindow({ open, busy, onYes, onClose }) {
  const box = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    addEventListener('keydown', key)
    const t = setTimeout(() => box.current?.querySelector('.acc-modal-actions .btn:not(.ghost)')?.focus(), 60)
    return () => { removeEventListener('keydown', key); clearTimeout(t); before?.focus?.() }
  }, [open, busy, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="acc-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
          <motion.div ref={box} className="acc-modal-box" role="alertdialog" aria-modal="true" aria-labelledby="acc-rcv-title" aria-describedby="acc-rcv-text"
            initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
            <button type="button" className="acc-modal-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
            <span className="acc-modal-icon is-ok" aria-hidden="true">✓</span>
            <h2 id="acc-rcv-title">Received your commission?</h2>
            <p id="acc-rcv-text" className="acc-del-text">Confirm you&rsquo;ve received your commission? The conversation closes once you do.</p>
            <div className="acc-modal-actions">
              <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>Not yet</button>
              <button type="button" className="btn sm" onClick={onYes} disabled={busy}>{busy ? 'One moment…' : 'Yes, I have it'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Tracker({ status, stages }) {
  if (status === 'cancelled') return <p className="acc-refund">This commission was cancelled.</p>
  const steps = stepsFor(stages)
  const at = steps.findIndex(([k]) => k === status)
  return (
    <ol className="acc-steps acc-csteps" aria-label="Where it is" style={{ '--n': steps.length }}>
      {steps.map(([k, label], i) => <li key={k} className={i <= at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}><i aria-hidden="true" /><span>{label}</span></li>)}
    </ol>
  )
}

// a quote, as it shows in the conversation: the price and everything it comes with
function QuoteNote({ q }) {
  return (
    <div className="acc-qnote">
      <span className="acc-qnote-tag">Quote</span>
      <strong>{priced(q.price, q.currency)}</strong>
      <p><Linked text={q.includes} /></p>
      <dl>
        {q.due && <><dt>Ready by</dt><dd>{dueDay(q.due)}</dd></>}
        <dt>Delivery</dt><dd>{q.ship ? 'Posted to you' : 'Digital'}</dd>
        <dt>Stages</dt><dd>{stagesWords(q.stages)}</dd>
      </dl>
    </div>
  )
}

function Thread({ messages }) {
  const end = useRef(null)
  const count = messages.length
  useEffect(() => { const box = end.current && end.current.parentElement; if (box) box.scrollTop = box.scrollHeight }, [count])
  return (
    <div className="acc-thread" aria-live="polite">
      {messages.map((m, i) => (
        <div key={i} className={`acc-msg is-${m.from === 'customer' ? 'mine' : m.from === 'artist' ? 'theirs' : 'note'}`}>
          {m.from !== 'system' && <span className="acc-msg-who">{m.from === 'customer' ? 'You' : ARTIST}</span>}
          {m.kind === 'quote' && m.quote ? <QuoteNote q={m.quote} /> : <div className="acc-msg-bubble">
            {m.text && <p><Linked text={m.text} /></p>}
            {m.links && m.links.length > 0 && <ul className="acc-msg-links">{m.links.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer nofollow">{l.replace(/^https?:\/\//, '')}</a></li>)}</ul>}
          </div>}
          <time dateTime={new Date(m.at).toISOString()}>{when(m.at)}</time>
        </div>
      ))}
      <span ref={end} />
    </div>
  )
}

function Reply({ id, onSent }) {
  const [text, setText] = useState('')
  const [links, setLinks] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const send = async (e) => {
    e.preventDefault()
    if (busy || (!text.trim() && !links.trim())) return
    setBusy(true); setProblem('')
    try { const s = await askCommissions('message', { id, text, links: links.split(/[\s,]+/).filter(Boolean) }); setText(''); setLinks(''); setMore(false); onSent(s.commission) } catch (err) { setProblem(err.message) }
    setBusy(false)
  }
  return (
    <form className="acc-reply" onSubmit={send}>
      <label className="sr-only" htmlFor={`reply-${id}`}>Your message</label>
      <textarea id={`reply-${id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write to ${ARTIST}…`} maxLength={4000} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e) }} />
      {more ? (
        <input type="text" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Links to pictures (paste one or more)" aria-label="Links to pictures" />
      ) : <button type="button" className="acc-link" onClick={() => setMore(true)}>+ Add links to pictures</button>}
      <div className="acc-reply-foot">
        {problem && <span className="acc-reply-bad" role="alert">{problem}</span>}
        <button type="submit" className="btn sm" disabled={busy || (!text.trim() && !links.trim())}>{busy ? 'Sending…' : 'Send'} <span className="arrow">→</span></button>
      </div>
    </form>
  )
}

function QuoteCard({ c, ways }) {
  const q = c.quote
  const [paying, setPaying] = useState(false)
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')
  // a discount code, checked as the cart checks one (a reward code works only for its owner); the payment checks it again
  const [codeOpen, setCodeOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [code, setCode] = useState(null)
  const [codeNote, setCodeNote] = useState('')
  const [checking, setChecking] = useState(false)
  const off = code ? Math.round(q.price * code.percent) / 100 : 0
  const apply = async (e) => {
    e.preventDefault()
    if (!typed.trim() || checking) return
    setChecking(true); setCodeNote('')
    try {
      const answer = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ check: typed.trim() }) })
      const said = await answer.json().catch(() => ({}))
      if (answer.ok && said.ok) { setCode({ code: said.code, percent: said.percent, label: said.label }); setCodeOpen(false); setTyped('') } else setCodeNote(said.message || 'That code is not valid.')
    } catch { setCodeNote('The code could not be checked. Try again in a moment.') }
    setChecking(false)
  }
  const pay = async (provider) => {
    setBusy(provider); setProblem('')
    try { const s = await askCommissions('pay', { id: c.id, provider, ...(code ? { code: code.code } : {}) }); window.location.href = s.url; return } catch (e) { setProblem(e.message); if (e.field === 'code') setCode(null) }
    setBusy('')
  }
  const open = c.status === 'quoted'
  return (
    <section className={`acc-quote ${open ? 'is-open' : ''}`}>
      <div className="label">{open ? 'Your quote' : 'The quote'}</div>
      <div className="acc-quote-price">{priced(q.price, q.currency)}</div>
      <p className="acc-quote-what"><Linked text={q.includes} /></p>
      <p className="acc-quote-meta">
        {q.due && <span>Ready by {dueDay(q.due)}</span>}
        <span>{q.ship ? 'Posted to you' : 'Digital'}</span>
        <span>{stagesWords(q.stages)}</span>
      </p>
      {open && (
        <div className="acc-quote-code">
          {code ? (
            <p className="acc-quote-off"><span>Code <b>{code.code}</b>: −{priced(off, q.currency)} ({code.percent}% off)</span><button type="button" className="acc-link" onClick={() => setCode(null)} aria-label={`Remove the code ${code.code}`}>Remove</button></p>
          ) : codeOpen ? (
            <form className="acc-quote-codeform" onSubmit={apply}>
              <label htmlFor={`code-${c.id}`}>Discount code</label>
              <div>
                <input id={`code-${c.id}`} type="text" value={typed} onChange={(e) => { setTyped(e.target.value.toUpperCase()); setCodeNote('') }} autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={40} aria-describedby={codeNote ? `code-${c.id}-note` : undefined} aria-invalid={codeNote ? 'true' : undefined} />
                <button type="submit" className="btn sm" disabled={checking || !typed.trim()}>{checking ? 'Checking…' : 'Apply'}</button>
              </div>
              {codeNote && <small id={`code-${c.id}-note`} className="acc-reply-bad" role="alert">{codeNote}</small>}
            </form>
          ) : <button type="button" className="acc-link" onClick={() => setCodeOpen(true)}>Have a discount code?</button>}
          {code && <p className="acc-quote-total"><span>To pay</span><b>{priced(Math.max(0, q.price - off), q.currency)}</b></p>}
        </div>
      )}
      {open && !paying && <button type="button" className="btn" onClick={() => setPaying(true)}>Accept and pay <span className="arrow">→</span></button>}
      {open && paying && (
        <div className="acc-quote-pay">
          {ways.card && (
            <button type="button" className={`btn buy-btn ${busy === 'card' ? 'is-busy' : ''}`} onClick={() => pay('card')} disabled={Boolean(busy)} aria-busy={busy === 'card'}>
              <span className="buy-btn-label">{busy === 'card' ? 'Opening secure checkout' : ways.paypal ? 'Pay by card' : 'Checkout'}</span>
              <span className="buy-btn-icon" aria-hidden="true">{busy === 'card' ? <i className="buy-spin" /> : '→'}</span>
            </button>
          )}
          {ways.paypal && <PaypalButton busy={busy === 'paypal'} onClick={() => pay('paypal')} />}
          {!ways.card && !ways.paypal && <p className="acc-reply-bad">Paying online is not set up right now. Write to {ARTIST} below and you will hear how to pay.</p>}
          <p className="buy-secure"><Lock /><span>{q.ship ? 'You enter your delivery address on the next page. ' : ''}Full price, paid up front.</span></p>
          <button type="button" className="acc-link" onClick={() => setPaying(false)} disabled={Boolean(busy)}>Not yet</button>
        </div>
      )}
      {problem && <p className="acc-reply-bad" role="alert">{problem}</p>}
      {open && c.paying && !paying && <p className="acc-quote-note">A payment page was opened for this quote. If you paid, it shows here in a moment.</p>}
    </section>
  )
}

function Commission({ id, close, onChange, paid, paypalToken, clearReturn, clearPaid }) {
  const [c, setC] = useState(null)
  const [ways, setWays] = useState({ card: false, paypal: false })
  const [problem, setProblem] = useState('')
  const [capture, setCapture] = useState(paypalToken ? 'taking' : '')
  const [cancelling, setCancelling] = useState(false)
  const [confirming, setConfirming] = useState(false) // the "received it?" window
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => askCommissions('get', { id }).then((s) => { setC(s.commission); setWays(s.payWays || {}); setProblem(''); onChange() }).catch((e) => setProblem(e.message)), [id, onChange])
  useEffect(() => {
    load()
    // just back from paying: Stripe tells the site a moment later, so asked again a few times
    const soon = paid ? [2500, 6000, 12000, 20000].map((ms) => setTimeout(load, ms)) : []
    /* New messages show the moment they are sent: while the conversation is open and in view, the
       site sends every change down a live line (readStream), opened again whenever it ends. Should
       the database not be able to (it says so), or the line fail three times running, the page asks
       instead: every 3 seconds, every 10 once nothing has changed for a minute. Hidden: nothing. */
    let timer = 0
    let gone = false
    let lastSeen = ''
    let quietSince = Date.now()
    let live = false // the line is open: no need to ask
    let lineOff = false // asking instead, from now on
    let failures = 0
    let line = null
    let listening = false
    const take = (s) => {
      if (!s || !s.commission) return
      const k = keyOf(s.commission)
      if (k === lastSeen) return
      lastSeen = k; quietSince = Date.now()
      setC(s.commission); if (s.payWays) setWays(s.payWays); onChange()
    }
    const listen = async () => {
      if (listening || lineOff || gone) return
      listening = true
      while (!gone && !lineOff && document.visibilityState === 'visible') {
        line = new AbortController()
        let heard = false
        try {
          await readStream(`/api/commissions?stream=${encodeURIComponent(id)}`, line.signal, (event, data) => {
            if (event === 'commission') { heard = true; live = true; failures = 0; take(data) } else if (event === 'fallback' || event === 'gone') lineOff = true
          })
        } catch { /* opened again below */ }
        live = false
        if (gone || lineOff) break
        if (!heard && ++failures >= 3) { lineOff = true; break }
        await sleep(heard ? 200 : 1500 * failures)
      }
      listening = false
    }
    const tick = async () => {
      if (gone) return
      if (!live && document.visibilityState === 'visible') take(await askCommissions('get', { id }).catch(() => null))
      if (gone) return
      timer = setTimeout(tick, Date.now() - quietSince > 60000 ? 10000 : 3000)
    }
    timer = setTimeout(tick, 3000)
    listen()
    const back = () => {
      if (document.visibilityState === 'visible') { quietSince = Date.now(); clearTimeout(timer); tick(); listen() } else if (line) line.abort()
    }
    document.addEventListener('visibilitychange', back)
    return () => { gone = true; if (line) line.abort(); soon.forEach(clearTimeout); clearTimeout(timer); document.removeEventListener('visibilitychange', back) }
  }, [load, paid])
  // back from PayPal: the payment is taken now (only the order opened for this quote)
  useEffect(() => {
    if (!paypalToken) return undefined
    let gone = false
    askCommissions('capture', { id, order: paypalToken })
      .then((s) => { if (!gone) { setC(s.commission); setCapture('paid'); onChange(); clearReturn() } })
      .catch((e) => { if (!gone) { setCapture(e.message); clearReturn() } })
    return () => { gone = true }
  }, [paypalToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // the thank-you stays a little while once the payment shows, then leaves the address
  const shownPaid = Boolean(c && c.payment)
  useEffect(() => {
    if (!paid || !shownPaid) return undefined
    const t = setTimeout(clearPaid, 12000)
    return () => clearTimeout(t)
  }, [paid, shownPaid, clearPaid])

  if (problem && !c) return <><button type="button" className="acc-link" onClick={close}>← All commissions</button><p className="acc-problem">{problem}</p></>
  if (!c) return <p className="acc-wait">Opening it…</p>
  const isPaid = Boolean(c.payment)
  const d = c.details || {}
  const received = async () => { setBusy(true); try { const s = await askCommissions('confirm', { id }); setC(s.commission); onChange(); setConfirming(false) } catch (e) { setProblem(e.message) } setBusy(false) }
  const cancel = async () => { setBusy(true); try { const s = await askCommissions('cancel', { id }); setC(s.commission); onChange() } catch (e) { setProblem(e.message) } setBusy(false); setCancelling(false) }
  return (
    <div className="acc-com">
      <button type="button" className="acc-link acc-com-back" onClick={close}>← All commissions</button>
      {capture === 'taking' && <p className="acc-wait" role="status">Taking the PayPal payment…</p>}
      {capture && capture !== 'taking' && capture !== 'paid' && <p className="acc-problem" role="alert">{capture}</p>}
      {(paid || capture === 'paid') && (
        <div className="acc-welcome" role="status">{isPaid ? <><b>Paid, thank you!</b> The work starts now: follow each stage here, and {ARTIST} will write as it goes.</> : <>Thank you! Confirming your payment… it shows here in a moment.</>}</div>
      )}
      <article className="acc-order acc-com-card">
        <header className="acc-order-head">
          <div>
            <strong>{c.title}</strong>
            <small>{c.number} · {d.kind} · asked {longDay(c.createdAt)}</small>
          </div>
          <span className={`acc-pill is-${c.status}`}>{WORDS[c.status] || c.status}</span>
        </header>
        <Tracker status={c.status} stages={c.stages} />

        {isPaid && (
          <section className="acc-order-foot acc-com-paid">
            <div>
              <div className="label">Paid</div>
              <p><b>{priced(c.payment.amount, c.payment.currency)}</b>{c.payment.paidWith ? ` · ${c.payment.paidWith}` : ''} · {longDay(c.payment.paidAt)}{c.payment.refunded ? ' · refunded' : ''}</p>
              {c.payment.code && <p className="acc-com-dim">Code {c.payment.code}: −{priced(c.payment.discount || 0, c.payment.currency)}</p>}
              {c.quote && <p className="acc-com-dim"><Linked text={c.quote.includes} />{c.quote.due ? ` · ready by ${dueDay(c.quote.due)}` : ''}</p>}
            </div>
            <div>
              <div className="label">{c.quote && c.quote.ship ? 'Posting to' : 'Delivery'}</div>
              {c.address ? <p>{[c.address.name, c.address.line1, c.address.line2, [c.address.city, c.address.state, c.address.postal_code].filter(Boolean).join(' '), c.address.country].filter(Boolean).map((l, i) => <span key={i}>{l}<br /></span>)}</p> : <p>{c.quote && c.quote.ship ? 'The address you gave at the checkout.' : 'Digital: the finished file comes here and by email.'}</p>}
            </div>
          </section>
        )}

        <section className="acc-com-talk">
          <div className="label">The conversation</div>
          <Thread messages={c.messages || []} />
          {/* the latest quote stays here, above the reply box, until it is paid */}
          {c.quote && !isPaid && c.status !== 'cancelled' && <QuoteCard c={c} ways={ways} />}
          {/* delivered: they say when they have it, and it is complete */}
          {c.status === 'delivered' && (
            <div className="acc-received">
              <div><strong>Has it reached you?</strong><span>Once you have your commission, let {ARTIST} know. The conversation closes once you do.</span></div>
              <button type="button" className="btn" onClick={() => setConfirming(true)}>I&rsquo;ve received it <span className="arrow">✓</span></button>
            </div>
          )}
          {c.status === 'complete' ? (
            <div className="acc-closed">
              <p><b>This commission is complete.</b>{c.completedAt ? ` You confirmed it on ${longDay(c.completedAt)}.` : ''} Want something new?</p>
              <Link className="btn sm" to="/commissions#request">Request a new commission <span className="arrow">→</span></Link>
            </div>
          ) : c.status === 'cancelled' ? <p className="acc-closed"><b>This commission was cancelled.</b> The conversation is closed.</p>
            : <Reply id={c.id} onSent={(next) => { setC(next); onChange() }} />}
          <ReceivedWindow open={confirming} busy={busy} onYes={received} onClose={() => setConfirming(false)} />
          {problem && <p className="acc-problem">{problem}</p>}
        </section>

        <details className="acc-com-ask">
          <summary>What you asked for</summary>
          <dl>
            <dt>Kind</dt><dd>{d.kind || '—'}</dd>
            {d.size && <><dt>Size</dt><dd>{d.size}</dd></>}
            {d.budget && <><dt>Budget</dt><dd>{d.budget}</dd></>}
            <dt>Needed by</dt><dd>{d.due || 'No deadline'}</dd>
            <dt>The idea</dt><dd><Linked text={d.idea} /></dd>
            {d.refs && d.refs.length > 0 && <><dt>References</dt><dd>{d.refs.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer nofollow">{l.replace(/^https?:\/\//, '')}</a>)}</dd></>}
          </dl>
        </details>

        {['requested', 'discussing', 'quoted'].includes(c.status) && (
          <div className="acc-com-cancel">
            {cancelling ? (
              <><span>Cancel this commission? {ARTIST} is told.</span><button type="button" className="btn ghost sm" onClick={() => setCancelling(false)} disabled={busy}>Keep it</button><button type="button" className="btn sm acc-modal-yes" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel it'}</button></>
            ) : <button type="button" className="acc-link" onClick={() => setCancelling(true)}>Cancel this commission</button>}
          </div>
        )}
      </article>
    </div>
  )
}

/* The Commissions part of the Orders tab. `params`/`setParams` are the page's address. */
export default function AccountCommissions({ list, reload, params, setParams }) {
  const id = params.get('c') || ''
  const paid = params.get('paid') === '1'
  const paypalToken = params.get('paypal') === 'return' ? params.get('token') || '' : ''
  const to = (next) => setParams(next, { replace: true })
  const open = (cid) => { to({ tab: 'orders', view: 'commissions', c: cid }); window.scrollTo?.({ top: Math.min(window.scrollY, 420), behavior: 'smooth' }) }
  const close = () => to({ tab: 'orders', view: 'commissions' })
  const clearReturn = useCallback(() => setParams(id ? { tab: 'orders', view: 'commissions', c: id, ...(paid ? { paid: '1' } : {}) } : { tab: 'orders', view: 'commissions' }, { replace: true }), [id, paid, setParams])
  const clearPaid = useCallback(() => setParams({ tab: 'orders', view: 'commissions', c: id }, { replace: true }), [id, setParams])
  if (id) return <Commission key={id} id={id} close={close} onChange={reload} paid={paid} paypalToken={paypalToken} clearReturn={clearReturn} clearPaid={clearPaid} />
  return <CommissionList list={list} open={open} reload={reload} />
}
