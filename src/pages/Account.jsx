import { useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Page from '../components/Page'
import { accountPage, asset, brand, canBuy, faceLook, money, priceOf, priceVaries, soldOut, work } from '../data/site'
import Poster from '../components/Poster'
import Wordmark from '../components/Wordmark'
import { useAccount } from '../hooks/useAccount'
import { useCart } from '../hooks/useCart'

/* Customer accounts: log in, make an account, forgotten and new passwords, confirming the email
   address, and the account itself (orders with their tracking, details, security). Everything
   goes through api/account.js; the login is an HTTP-only cookie the page never handles. */
const EASE = [0.16, 1, 0.3, 1]

/* ---------- small parts ---------- */
function Field({ label, type = 'text', value, onChange, autoComplete, error, hint, required = true, maxLength = 200 }) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const secret = type === 'password'
  return (
    <div className={`field acc-field ${error ? 'has-error' : ''}`}>
      <input id={id} type={secret && shown ? 'text' : type} value={value} onChange={(e) => onChange(e.target.value)} placeholder=" " required={required} autoComplete={autoComplete} maxLength={maxLength} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-note` : undefined} />
      <label htmlFor={id}>{label}</label>
      <span className="bar" />
      {secret && <button type="button" className="acc-eye" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide the password' : 'Show the password'} aria-pressed={shown}>{shown ? 'Hide' : 'Show'}</button>}
      {(error || hint) && <p id={`${id}-note`} className={`acc-note ${error ? 'is-error' : ''}`}>{error || hint}</p>}
    </div>
  )
}

function Problem({ text }) {
  return (
    <AnimatePresence>
      {text && <motion.p className="acc-problem" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{text}</motion.p>}
    </AnimatePresence>
  )
}

function Submit({ busy, children }) {
  return <button className="btn acc-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'One moment…' : children} {!busy && <span className="arrow">→</span>}</button>
}

/* the frame of the smaller pages: a label, a title, a line, and a card with the form */
function Shell({ title, label, lead, children, cardName }) {
  return (
    <Page title={title}>
      <div className="container acc-split">
        <div className="acc-split-main">
          <header className="page-head acc-head">
            <div className="label accent">{label}</div>
            <h1 className="display h-xl">{title}</h1>
            {lead && <p className="lead">{lead}</p>}
          </header>
          <div className="acc-narrow">{children}</div>
        </div>
        <AuthArt cardName={cardName} />
      </div>
    </Page>
  )
}

/* beside the forms: a collector card (the name on it follows what is typed when making an account),
   and what an account is good for */
const PERKS = [
  ['Track every order', 'From the studio to your door, step by step.'],
  ['Save pieces for later', 'A heart on every print, kept in one place.'],
  ['Your cart, everywhere', 'Start on your phone, finish on your laptop.'],
  ['Your own corner', 'Your collection, hung on your own wall.'],
]
/* the collector card: the name, the year they joined, a card number, and what they have collected */
function CollectorCard({ name, since, number, prints }) {
  const card = useRef(null)
  // the card leans toward the pointer, a little
  const lean = (e) => {
    const el = card.current
    if (!el || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -10}deg`)
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 14}deg`)
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
  }
  const rest = () => { const el = card.current; if (el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--mx') } }
  const shown = (name || '').trim()
  return (
    <div className="acc-card3d-wrap" onPointerMove={lean} onPointerLeave={rest}>
      <div ref={card} className="acc-card3d" role="img" aria-label={`${brand.name} collector card${shown ? ` for ${shown}` : ''}`}>
        <span className="acc-card3d-shine" />
        <span className="acc-card3d-mark" aria-hidden="true">J</span>
        <div className="acc-card3d-top" aria-hidden="true">
          <span className="acc-card3d-brand">{brand.logo && <img src={asset(brand.logo)} alt="" />}<Wordmark /></span>
          <span className="acc-card3d-kind">Collector</span>
        </div>
        <span className="acc-card3d-chip" aria-hidden="true" />
        <div className={`acc-card3d-name ${shown ? '' : 'is-empty'}`} aria-hidden="true">{shown || 'Your name here'}</div>
        <div className="acc-card3d-foot" aria-hidden="true">
          <span><small>Member since</small>{since}</span>
          <span><small>Member no.</small>{number}</span>
          <span><small>Prints</small>{prints}</span>
        </div>
      </div>
    </div>
  )
}
// the same four digits for the same customer, every time
// member 1 reads #0001
const memberNumber = (n) => (n ? `#${String(n).padStart(4, '0')}` : '#----')

function AuthArt({ cardName }) {
  return (
    <aside className="acc-art">
      <CollectorCard name={cardName} since={new Date().getFullYear()} number={memberNumber(null)} prints="Your collection" />
      <ul className="acc-perks">
        {PERKS.map(([t, d]) => <li key={t}><i aria-hidden="true" /><div><b>{t}</b><span>{d}</span></div></li>)}
      </ul>
    </aside>
  )
}

// a form's own state: its values, the field with a problem, the message, and busy
function useForm(initial) {
  const [values, setValues] = useState(initial)
  const [problem, setProblem] = useState({ field: '', text: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => { setValues((x) => ({ ...x, [k]: v })); if (problem.field === k) setProblem({ field: '', text: '' }) }
  const run = async (e, work) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setProblem({ field: '', text: '' })
    try { await work() } catch (err) { setProblem({ field: err.field || '', text: err.message }) }
    setBusy(false)
  }
  return { values, set, problem, busy, run, setProblem }
}
const errorFor = (problem, field) => (problem.field === field ? problem.text : '')
const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/account')

/* ---------- log in ---------- */
function Login() {
  const { user, call } = useAccount()
  const cart = useCart()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const f = useForm({ email: '', password: '' })
  if (user) return <Navigate to={next} replace />
  return (
    <Shell title="Log in" label="Your account" lead="Your orders, their tracking, and your cart on every device.">
      <form className="acc-card" onSubmit={(e) => f.run(e, async () => { await call('login', { ...f.values, cart: cart.stored }); navigate(next, { replace: true }) })} noValidate>
        <Field label="Email" type="email" autoComplete="email" value={f.values.email} onChange={f.set('email')} />
        <Field label="Password" type="password" autoComplete="current-password" value={f.values.password} onChange={f.set('password')} />
        <Problem text={f.problem.text} />
        <Submit busy={f.busy}>Log in</Submit>
        <div className="acc-links">
          <Link to="/account/forgot">Forgot your password?</Link>
          <span>New here? <Link to={`/account/signup${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}>Make an account</Link></span>
        </div>
      </form>
    </Shell>
  )
}

/* ---------- make an account ---------- */
function Signup() {
  const { user, call } = useAccount()
  const cart = useCart()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const f = useForm({ name: '', email: '', password: '', marketing: false })
  const made = useRef(false) // just made here: the account page greets them
  if (user) return <Navigate to={made.current && next === '/account' ? '/account?welcome=1' : next} replace />
  return (
    <Shell title="Make an account" label="Your account" lead="Keep your cart, follow your orders, and buy faster next time." cardName={f.values.name}>
      <form className="acc-card" onSubmit={(e) => f.run(e, async () => { made.current = true; await call('signup', { ...f.values, cart: cart.stored }); navigate(next === '/account' ? '/account?welcome=1' : next, { replace: true }) })} noValidate>
        <Field label="Your name" autoComplete="name" value={f.values.name} onChange={f.set('name')} required={false} maxLength={80} />
        <Field label="Email" type="email" autoComplete="email" value={f.values.email} onChange={f.set('email')} error={errorFor(f.problem, 'email')} />
        <Field label="Password" type="password" autoComplete="new-password" value={f.values.password} onChange={f.set('password')} error={errorFor(f.problem, 'password')} hint="At least 8 characters." />
        <label className="acc-check">
          <input type="checkbox" checked={f.values.marketing} onChange={(e) => f.set('marketing')(e.target.checked)} />
          <span>Email me about new prints and conventions. (Now and then; never shared.)</span>
        </label>
        <Problem text={f.problem.field ? '' : f.problem.text} />
        <Submit busy={f.busy}>Make my account</Submit>
        <div className="acc-links"><span>Already have one? <Link to="/account/login">Log in</Link></span></div>
      </form>
    </Shell>
  )
}

/* ---------- forgotten password ---------- */
function Forgot() {
  const { call } = useAccount()
  const f = useForm({ email: '' })
  const [sent, setSent] = useState('')
  return (
    <Shell title="Forgot your password?" label="Your account" lead="Type your email and a link to choose a new password is on its way.">
      {sent ? (
        <div className="acc-card acc-done" role="status">
          <i aria-hidden="true">✓</i>
          <p>If there is an account for <b>{sent}</b>, an email with a link is on its way. It works for 60 minutes. Nothing there? Check the spam folder.</p>
          <Link className="btn ghost sm" to="/account/login">Back to log in <span className="arrow">→</span></Link>
        </div>
      ) : (
        <form className="acc-card" onSubmit={(e) => f.run(e, async () => { await call('forgot', f.values); setSent(f.values.email) })} noValidate>
          <Field label="Email" type="email" autoComplete="email" value={f.values.email} onChange={f.set('email')} error={errorFor(f.problem, 'email')} />
          <Problem text={f.problem.field ? '' : f.problem.text} />
          <Submit busy={f.busy}>Email me a link</Submit>
          <div className="acc-links"><Link to="/account/login">Back to log in</Link></div>
        </form>
      )}
    </Shell>
  )
}

/* ---------- a new password, from the emailed link ---------- */
function Reset() {
  const { call } = useAccount()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const f = useForm({ password: '', again: '' })
  if (!token) return <Navigate to="/account/forgot" replace />
  return (
    <Shell title="Choose a new password" label="Your account">
      <form className="acc-card" onSubmit={(e) => f.run(e, async () => {
        if (f.values.password !== f.values.again) { const p = new Error('The two passwords are not the same.'); p.field = 'again'; throw p }
        await call('reset', { token, password: f.values.password })
        navigate('/account?reset=1', { replace: true })
      })} noValidate>
        <Field label="New password" type="password" autoComplete="new-password" value={f.values.password} onChange={f.set('password')} error={errorFor(f.problem, 'password')} hint="At least 8 characters." />
        <Field label="The same again" type="password" autoComplete="new-password" value={f.values.again} onChange={f.set('again')} error={errorFor(f.problem, 'again')} />
        <Problem text={f.problem.field ? '' : f.problem.text} />
        <Submit busy={f.busy}>Save it and log in</Submit>
        {f.problem.text && !f.problem.field && <div className="acc-links"><Link to="/account/forgot">Ask for a new link</Link></div>}
      </form>
    </Shell>
  )
}

/* ---------- confirming the email address, from the emailed link ---------- */
function Verify() {
  const { call, user } = useAccount()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState(token ? 'working' : 'missing')
  const [text, setText] = useState('')
  useEffect(() => {
    if (!token) return
    let stale = false
    call('verify', { token }).then(() => { if (!stale) setState('done') }).catch((e) => { if (!stale) { setState('failed'); setText(e.message) } })
    return () => { stale = true }
  }, [token, call])
  return (
    <Shell title={state === 'done' ? 'Email confirmed' : 'Confirm your email'} label="Your account">
      <div className={`acc-card acc-done ${state === 'failed' || state === 'missing' ? 'is-bad' : ''}`} role="status">
        <i aria-hidden="true">{state === 'done' ? '✓' : state === 'working' ? '…' : '!'}</i>
        <p>{state === 'working' ? 'Checking the link…' : state === 'done' ? 'Thank you. Every order placed with this email now shows in your account.' : state === 'missing' ? 'This page needs the link from the email.' : text}</p>
        <Link className="btn ghost sm" to={user ? '/account' : '/account/login'}>{user ? 'Go to your account' : 'Log in'} <span className="arrow">→</span></Link>
      </div>
    </Shell>
  )
}

/* ---------- "are you sure?": a small window over the page. Escape, the cross or a click outside
   says no; the answer button runs the action and shows that it is working. */
function Confirm({ open, title, text, yes, onYes, onClose }) {
  const [busy, setBusy] = useState(false)
  const yesBtn = useRef(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', key)
    const t = setTimeout(() => yesBtn.current?.focus(), 60)
    window.__lenis?.stop?.()
    return () => { removeEventListener('keydown', key); clearTimeout(t); window.__lenis?.start?.(); before?.focus?.() }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="acc-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
          <motion.div className="acc-modal-box" role="alertdialog" aria-modal="true" aria-labelledby="acc-modal-title" aria-describedby="acc-modal-text" initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3, ease: EASE }}>
            <button type="button" className="acc-modal-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
            <span className="acc-modal-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10" /></svg></span>
            <h2 id="acc-modal-title">{title}</h2>
            <p id="acc-modal-text">{text}</p>
            <div className="acc-modal-actions">
              <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>Stay logged in</button>
              <button ref={yesBtn} type="button" className="btn sm acc-modal-yes" disabled={busy} onClick={async () => { setBusy(true); try { await onYes() } finally { setBusy(false) } }}>{busy ? 'Logging out…' : yes}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- the account ---------- */
// the piece an order line is about ("The Rider · A2 (signed)" → The Rider); the longest title wins
const pieceFor = (name) => work.filter((p) => p.title && String(name || '').startsWith(p.title)).sort((a, b) => b.title.length - a.title.length)[0] || null
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late' }
const monthYear = (d) => new Date(d).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
const initialsOf = (u) => ((u.name || u.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''))

/* the customer's picture: one of the artist's pieces they chose, or their initials */
function Avatar({ user, size = 'md' }) {
  const icon = user.avatar && user.avatar.startsWith('icon:') ? user.avatar.slice(5) : ''
  const piece = user.avatar && !icon ? work.find((p) => p.slug === user.avatar && p.src) : null
  return (
    <span className={`acct-avatar is-${size}`} aria-hidden="true">
      {icon ? <img src={asset(icon)} alt="" style={faceLook(accountPage.icons.find((i) => i.picture === icon))} /> : piece ? <img src={asset(piece.src)} alt="" style={faceLook(piece)} /> : <b>{initialsOf(user)}</b>}
    </span>
  )
}

/* a small piece card: picture, title, price; a heart to keep it for later */
function PieceCard({ p }) {
  const { isSaved, toggleSaved } = useAccount()
  const low = priceOf(p)
  const saved = isSaved(p.slug)
  return (
    <div className="acct-piece">
      <Link className="acct-piece-art" to="/shop" title={`Find ${p.title} in the Shop`}>
        <Poster title={p.title} hue={p.hue} src={p.src} seed={work.indexOf(p)} />
      </Link>
      <button type="button" className={`acct-heart ${saved ? 'on' : ''}`} onClick={() => toggleSaved(p.slug)} aria-pressed={saved} aria-label={saved ? `Remove ${p.title} from saved` : `Save ${p.title} for later`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.500s-7.500-4.600-7.500-10.300A4.300 4.300 0 0 1 12 7.400a4.300 4.300 0 0 1 7.500 2.800c0 5.700-7.500 10.300-7.500 10.300z" /></svg>
      </button>
      <div className="acct-piece-cap">
        <strong>{p.title}</strong>
        <small>{soldOut(p) ? 'Sold out' : canBuy(p) ? <>{priceVaries(p) ? 'From ' : ''}{money(low.now, true)}</> : p.type || ''}</small>
      </div>
    </div>
  )
}
const STEPS = [['new', 'Paid'], ['packed', 'Packed'], ['shipped', 'On its way'], ['delivered', 'Delivered']]
const STATUS_TEXT = { new: 'Being prepared', packed: 'Packed', shipped: 'On its way', delivered: 'Delivered', refunded: 'Refunded', cancelled: 'Cancelled' }
const longDay = (d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
const priced = (n, code) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: code || 'AUD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n) } catch { return money(n) } }

function OrderCard({ o }) {
  const at = STEPS.findIndex(([k]) => k === o.status)
  const support = o.kind === 'support'
  return (
    <article className="acc-order">
      <header className="acc-order-head">
        <div>
          <strong>{support ? 'Support' : `Order ${o.number}`}</strong>
          <small>{longDay(o.createdAt)}{o.provider === 'paypal' ? ' · PayPal' : ''}</small>
        </div>
        <span className={`acc-pill is-${o.status}`}>{support ? 'Thank you' : STATUS_TEXT[o.status] || 'Paid'}</span>
      </header>
      <ul className="acc-items">
        {o.items.map((i, n) => {
          const p = pieceFor(i.name)
          return <li key={n}><span className="acc-item">{p && p.src ? <img src={asset(p.src)} alt="" /> : <i aria-hidden="true" />}<span>{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}</span></span>{i.amount != null && <b>{priced(i.amount, o.currency)}</b>}</li>
        })}
      </ul>
      {o.discount > 0 && <div className="acc-total is-discount"><span>Discount</span><b>−{priced(o.discount, o.currency)}</b></div>}
      <div className="acc-total"><span>Total</span><b>{priced(o.amount, o.currency)}</b></div>
      {!support && o.status !== 'refunded' && o.status !== 'cancelled' && (
        <ol className="acc-steps" aria-label="Where it is">
          {STEPS.map(([k, label], i) => <li key={k} className={i <= at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}><i aria-hidden="true" /><span>{label}</span></li>)}
        </ol>
      )}
      {o.status === 'refunded' && <p className="acc-refund">This order was refunded.</p>}
      {(o.tracking || o.address) && (
        <div className="acc-order-foot">
          {o.tracking && (
            <div>
              <div className="label">Tracking</div>
              <p>{o.carrier ? `${o.carrier} · ` : ''}<code>{o.tracking}</code></p>
              {o.trackUrl && <a className="btn ghost sm" href={o.trackUrl} target="_blank" rel="noreferrer">Track the parcel <span className="arrow">↗</span></a>}
            </div>
          )}
          {o.address && (
            <div>
              <div className="label">Posting to</div>
              <p>{[o.address.name, o.address.line1, o.address.line2, [o.address.city, o.address.state, o.address.postal_code].filter(Boolean).join(' '), o.address.country !== 'AU' ? o.address.country : ''].filter(Boolean).map((l, i) => <span key={i}>{l}<br /></span>)}</p>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// the customer's orders, fetched once for the whole account page
function useOrders() {
  const { call, user } = useAccount()
  const [orders, setOrders] = useState(null)
  const [problem, setProblem] = useState('')
  const verified = Boolean(user && user.verified) // confirming the email can bring more orders
  useEffect(() => {
    let stale = false
    call('orders').then((s) => { if (!stale) setOrders(s.orders || []) }).catch((e) => { if (!stale) setProblem(e.message) })
    return () => { stale = true }
  }, [call, verified])
  return { orders, problem }
}

function Orders({ orders, problem }) {
  const { user } = useAccount()
  if (problem) return <p className="acc-problem">{problem}</p>
  if (!orders) return <p className="acc-wait">Fetching your orders…</p>
  if (!orders.length) return (
    <div className="acc-empty">
      <strong>No orders yet</strong>
      <p>{user.verified ? 'When you buy a print, it shows here with its tracking.' : 'Orders placed while logged in show here. Confirm your email to see any placed with it before.'}</p>
      <Link className="btn sm" to="/shop">Go to the Shop <span className="arrow">→</span></Link>
    </div>
  )
  return <div className="acc-orders">{orders.map((o) => <OrderCard key={`${o.number}${o.createdAt}`} o={o} />)}</div>
}

function Details({ owned = [] }) {
  const { user, call } = useAccount()
  const f = useForm({ name: user.name, phone: user.phone, marketing: user.marketing, avatar: user.avatar || '' })
  const [saved, setSaved] = useState(false)
  const [resent, setResent] = useState('')
  const mine = owned.filter((p) => p.src)
  return (
    <form className="acc-card" onSubmit={(e) => f.run(e, async () => { await call('profile', f.values); setSaved(true); setTimeout(() => setSaved(false), 2500) })} noValidate>
      {/* the email, with whether it is confirmed (and a way to send the link again) */}
      <div className="acc-email">
        <div>
          <span className="label">Email</span>
          <b>{user.email}</b>
        </div>
        {user.verified
          ? <span className="acc-tag is-ok">Confirmed</span>
          : (
            <div className="acc-email-side">
              <span className="acc-tag is-wait">Not confirmed yet</span>
              <button type="button" className="acc-link" disabled={Boolean(resent)} onClick={async () => { try { await call('resend'); setResent('Link sent') } catch (err) { setResent(err.message) } }}>{resent || 'Send the link again'}</button>
            </div>
          )}
      </div>
      <div className="acc-grid">
        <Field label="Your name" autoComplete="name" value={f.values.name} onChange={f.set('name')} required={false} maxLength={80} />
        <Field label="Phone (optional, for the courier)" type="tel" autoComplete="tel" value={f.values.phone} onChange={f.set('phone')} required={false} maxLength={30} />
      </div>
      <label className="acc-check">
        <input type="checkbox" checked={f.values.marketing} onChange={(e) => f.set('marketing')(e.target.checked)} />
        <span>Email me about new prints and conventions.</span>
      </label>
      <fieldset className="acct-pick">
        <legend>Your picture</legend>
        <p>Choose one for your profile and your collector card, or keep your initials.</p>
        <div className="acct-pick-group" role="radiogroup" aria-label="Free pictures">
          <span className="acct-pick-label">Free for everyone</span>
          <div className="acct-pick-grid">
            <button type="button" role="radio" aria-checked={!f.values.avatar} title="Your initials" className={`acct-pick-one is-initials ${!f.values.avatar ? 'on' : ''}`} onClick={() => f.set('avatar')('')}><b>{initialsOf(user)}</b></button>
            {accountPage.icons.map((i) => {
              const v = `icon:${i.picture}`
              return (
                <button key={i.picture} type="button" role="radio" aria-checked={f.values.avatar === v} aria-label={i.name || 'Picture'} title={i.name || ''} className={`acct-pick-one ${f.values.avatar === v ? 'on' : ''}`} onClick={() => f.set('avatar')(v)}>
                  <span className="acct-pick-pic"><img src={asset(i.picture)} alt="" loading="lazy" style={faceLook(i)} /></span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="acct-pick-group is-mine" role="radiogroup" aria-label="From your collection">
          <span className="acct-pick-label">From your collection <em>only yours</em></span>
          {mine.length ? (
            <div className="acct-pick-grid">
              {mine.map((p) => (
                <button key={p.slug} type="button" role="radio" aria-checked={f.values.avatar === p.slug} aria-label={p.title} title={p.title} className={`acct-pick-one is-mine ${f.values.avatar === p.slug ? 'on' : ''}`} onClick={() => f.set('avatar')(p.slug)}>
                  <span className="acct-pick-pic"><img src={asset(p.src)} alt="" loading="lazy" style={faceLook(p)} /></span>
                </button>
              ))}
            </div>
          ) : (
            <p className="acct-pick-locked"><i aria-hidden="true">✦</i>Every print you buy becomes a picture here that only you can use. <Link to="/shop">Find one in the Shop</Link></p>
          )}
        </div>
      </fieldset>
      <Problem text={f.problem.text} />
      <div className="acc-row"><Submit busy={f.busy}>Save</Submit>{saved && <span className="acc-saved" role="status">Saved</span>}</div>
    </form>
  )
}

function Security() {
  const { call } = useAccount()
  const navigate = useNavigate()
  const pw = useForm({ current: '', password: '' })
  const [changed, setChanged] = useState(false)
  const del = useForm({ password: '' })
  const [deleting, setDeleting] = useState(false)
  const [askAll, setAskAll] = useState(false)
  return (
    <div className="acc-stack">
      <form className="acc-card" onSubmit={(e) => pw.run(e, async () => { await call('password', pw.values); setChanged(true); pw.set('current')(''); pw.set('password')('') })} noValidate>
        <h3 className="acc-h3">Change the password</h3>
        <div className="acc-grid">
          <Field label="Current password" type="password" autoComplete="current-password" value={pw.values.current} onChange={pw.set('current')} error={errorFor(pw.problem, 'current')} />
          <Field label="New password" type="password" autoComplete="new-password" value={pw.values.password} onChange={pw.set('password')} error={errorFor(pw.problem, 'password')} hint="At least 8 characters." />
        </div>
        <Problem text={pw.problem.field ? '' : pw.problem.text} />
        <div className="acc-row"><Submit busy={pw.busy}>Change it</Submit>{changed && <span className="acc-saved" role="status">Changed. Any other device was logged out.</span>}</div>
      </form>
      <div className="acc-card">
        <h3 className="acc-h3">Log out everywhere</h3>
        <p className="acc-p">Lost a phone, or logged in on a shared computer? This logs out every device, this one too.</p>
        <button type="button" className="btn ghost sm acc-out-all" onClick={() => setAskAll(true)}>Log out of every device</button>
        <Confirm open={askAll} title="Log out everywhere?" text="Every phone, tablet and computer logged in to this account is logged out, this one too. You can log back in with your password." yes="Log out everywhere" onYes={async () => { await call('everywhere').catch(() => {}); setAskAll(false); navigate('/account/login', { replace: true }) }} onClose={() => setAskAll(false)} />
      </div>
      <div className="acc-card is-danger">
        <h3 className="acc-h3">Delete the account</h3>
        <p className="acc-p">Your login, details and saved cart go for good. The shop keeps its record of past sales (as the law requires), no longer linked to you.</p>
        {!deleting ? (
          <button type="button" className="btn ghost sm acc-danger" onClick={() => setDeleting(true)}>Delete my account</button>
        ) : (
          <form onSubmit={(e) => del.run(e, async () => { await call('delete', del.values); navigate('/', { replace: true }) })} noValidate>
            <Field label="Your password, to be sure" type="password" autoComplete="current-password" value={del.values.password} onChange={del.set('password')} error={errorFor(del.problem, 'password')} />
            <Problem text={del.problem.field ? '' : del.problem.text} />
            <div className="acc-row">
              <button className="btn sm acc-danger-solid" type="submit" disabled={del.busy}>{del.busy ? 'Deleting…' : 'Yes, delete it'}</button>
              <button type="button" className="btn ghost sm" onClick={() => setDeleting(false)}>Keep it</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/* the first thing a customer sees: hello, how things stand, their prints, what is new */
function Overview({ orders, go }) {
  const { user } = useAccount()
  const shopOrders = (orders || []).filter((o) => o.kind !== 'support')
  const collected = shopOrders.reduce((n, o) => n + o.items.reduce((m, i) => m + (i.qty || 1), 0), 0)
  // the pieces they own, once each, newest first
  const owned = [...new Map(shopOrders.flatMap((o) => o.items.map((i) => pieceFor(i.name))).filter(Boolean).map((p) => [p.slug, p])).values()]
  const saved = (user.saved || []).map((slug) => work.find((p) => p.slug === slug)).filter(Boolean)
  const latest = shopOrders[0]
  return (
    <div className="acct-overview">
      <div className="acct-top">
        <CollectorCard
          name={user.name || user.email.split('@')[0]}
          since={new Date(user.createdAt).getFullYear()}
          number={memberNumber(user.memberNo)}
          prints={orders ? `${collected} ${collected === 1 ? 'print' : 'prints'}` : '…'}
        />
      <div className="acct-stats is-stacked">
        <button type="button" onClick={() => go('orders')}><strong>{orders ? shopOrders.length : '–'}</strong><span>{shopOrders.length === 1 ? 'Order' : 'Orders'}</span></button>
        <button type="button" onClick={() => go('orders')}><strong>{orders ? collected : '–'}</strong><span>{collected === 1 ? 'Print collected' : 'Prints collected'}</span></button>
        <button type="button" onClick={() => go('saved')}><strong>{saved.length}</strong><span>Saved for later</span></button>
      </div>
      </div>

      {latest ? (
        <section className="acct-block">
          <div className="acct-block-head"><h2>Your latest order</h2><button type="button" className="acc-link" onClick={() => go('orders')}>All orders</button></div>
          <OrderCard o={latest} />
        </section>
      ) : orders && (
        <section className="acct-invite">
          <div>
            <h2>Your first print is waiting</h2>
            <p>Find one you love: it will show up here, with its journey from the studio to your door.</p>
          </div>
          <Link className="btn" to="/shop">Browse the Shop <span className="arrow">→</span></Link>
        </section>
      )}

      {owned.length > 0 && (
        <section className="acct-block">
          <div className="acct-block-head"><h2>{accountPage.collectionTitle}</h2><span className="acct-count">{owned.length} {owned.length === 1 ? 'piece' : 'pieces'}</span></div>
          <div className="acct-wall">
            {owned.slice(0, 8).map((p, i) => (
              <figure key={p.slug} className="acct-frame" style={{ '--tilt': `${[-2, 1.5, -1, 2, -1.5, 1, -2.5, 1.5][i % 8]}deg` }}>
                <Poster title={p.title} hue={p.hue} src={p.src} seed={i} />
                <figcaption>{p.title}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="acct-block">
        <div className="acct-block-head"><h2>{accountPage.savedTitle}</h2>{saved.length > 0 && <button type="button" className="acc-link" onClick={() => go('saved')}>See all</button>}</div>
        {saved.length ? (
          <div className="acct-pieces">{saved.slice(0, 4).map((p) => <PieceCard key={p.slug} p={p} />)}</div>
        ) : (
          <p className="acct-quiet">Tap the heart on any piece to keep it here for later.</p>
        )}
      </section>


      {accountPage.note && (
        <section className="acct-note">
          {brand.logo && <img className="acct-note-logo" src={asset(brand.logo)} alt="" />}
          <div>
            <h2>{accountPage.noteTitle}</h2>
            <p>{accountPage.note}</p>
            {accountPage.signature && <p className="acct-sign">{accountPage.signature}</p>}
          </div>
        </section>
      )}
    </div>
  )
}

/* everything kept for later, ready to buy */
function Saved() {
  const { user } = useAccount()
  const saved = (user.saved || []).map((slug) => work.find((p) => p.slug === slug)).filter(Boolean)
  if (!saved.length) return (
    <div className="acc-empty">
      <strong>Nothing saved yet</strong>
      <p>Tap the heart on any piece (in the Shop, or here in your account) to keep it for later.</p>
      <Link className="btn sm" to="/shop">Go to the Shop <span className="arrow">→</span></Link>
    </div>
  )
  return <div className="acct-pieces is-roomy">{saved.map((p) => <PieceCard key={p.slug} p={p} />)}</div>
}

const TABS = [['overview', 'Overview'], ['orders', 'Orders'], ['saved', 'Saved'], ['details', 'Details'], ['security', 'Security']]
const TAB_ICONS = {
  overview: 'M4 11l8-7 8 7v9H4z M10 20v-6h4v6',
  orders: 'M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8',
  saved: 'M12 20.500s-7.500-4.600-7.500-10.300A4.300 4.300 0 0 1 12 7.400a4.300 4.300 0 0 1 7.500 2.800c0 5.700-7.500 10.300-7.500 10.300z',
  details: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c.8-3.800 4-6 8-6s7.200 2.200 8 6',
  security: 'M12 3l7 3v5c0 4.500-3 8.300-7 10-4-1.700-7-5.500-7-10V6z M9.500 12l2 2 3.500-3.500',
}
function Home() {
  const { user, call } = useAccount()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview'
  const [resent, setResent] = useState('')
  const { orders, problem } = useOrders()
  const [leaving, setLeaving] = useState(false) // the 'log out?' window
  const owned = [...new Map((orders || []).filter((o) => o.kind !== 'support').flatMap((o) => o.items.map((i) => pieceFor(i.name))).filter(Boolean).map((p) => [p.slug, p])).values()]
  const grid = useRef(null)
  // the browser tab's title follows the section, without the page's own scroll-to-top on a new title
  useEffect(() => { const name = TABS.find(([k]) => k === tab)[1]; document.title = `${tab === 'overview' ? 'Your account' : name} — ${brand.name}` }, [tab])
  if (!user) return <Navigate to="/account/login?next=/account" replace />
  const first = (user.name || '').split(' ')[0]
  const note = params.get('welcome') ? `Welcome${first ? `, ${first}` : ''}. Your account is ready.` : params.get('reset') ? 'Your new password is saved, and you are logged in.' : ''
  // another section: the page stays where it is; only if the panel and the section start above the
  // screen does it glide up to them (never back to the very top)
  const go = (k) => {
    setParams(k === 'overview' ? {} : { tab: k }, { replace: true })
    const el = grid.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top >= 0) return
    const y = window.scrollY + top - 90
    if (window.__lenis) window.__lenis.scrollTo(y, { duration: 0.6 }); else window.scrollTo({ top: y, behavior: 'smooth' })
  }
  const shopOrders = (orders || []).filter((o) => o.kind !== 'support')
  const counts = { orders: shopOrders.length, saved: (user.saved || []).length }
  const prints = shopOrders.reduce((n, o) => n + o.items.reduce((m, i) => m + (i.qty || 1), 0), 0)
  // the banner: art that is theirs (the print they picked as their picture, or one they own); else the brand's own colours
  const chosen = user.avatar && !user.avatar.startsWith('icon:') ? work.find((p) => p.slug === user.avatar) : null
  const banner = (chosen && chosen.src) || (owned.find((p) => p.src) || {}).src || ''
  const LEADS = {
    orders: 'Every print you have ordered, and where it is now.',
    saved: 'The pieces you are keeping an eye on.',
    details: 'Your name, how to reach you, and your picture.',
    security: 'Your password, your devices, your account.',
  }
  const logout = async () => { await call('logout').catch(() => {}); setLeaving(false); navigate('/', { replace: true }) }
  return (
    <Page title="Your account">
      <Confirm open={leaving} title="Log out?" text={`You can log back in any time with ${user.email}. Your cart and saved pieces stay with your account.`} yes="Log out" onYes={logout} onClose={() => setLeaving(false)} />
      <div className="container acct2">
        {/* the profile: a banner of their own art, their picture over its edge, their name */}
        <header className="acct2-hero">
          <div className="acct2-banner" aria-hidden="true">
            {banner && <img src={asset(banner)} alt="" />}
            <span className="acct2-lines" />
          </div>
          <div className="acct2-id">
            <Avatar user={user} size="xl" />
            <div className="acct2-who">
              <span className="label accent">{greeting()}</span>
              <h1 className="display">{user.name || first || 'Your account'}</h1>
              <p>
                <span>Member {memberNumber(user.memberNo)}</span>
                {orders && <span>{prints} {prints === 1 ? 'print' : 'prints'}</span>}
                <span className="acct2-since">Collector since {monthYear(user.createdAt)}</span>
              </p>
            </div>
            <div className="acct2-actions">
              <button type="button" className="btn ghost sm" onClick={() => go('details')}>Edit profile</button>
              <button type="button" className="acct2-out" onClick={() => setLeaving(true)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10" /></svg>
                Log out
              </button>
            </div>
          </div>
        </header>

        {/* the sections, across the page; they stay under the menu while scrolling */}
        <nav className="acct2-tabs" aria-label="Your account" ref={grid}>
          {TABS.map(([k, label]) => (
            <button key={k} type="button" className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={TAB_ICONS[k]} /></svg>
              <span>{label}</span>
              {counts[k] > 0 && <small>{counts[k]}</small>}
            </button>
          ))}
        </nav>

        <div className="acct2-main">
          {note && <p className="acc-welcome" role="status">{note}</p>}
          {!user.verified && tab !== 'details' && (
            <div className="acc-verify" role="status">
              <span>Confirm your email: there is a link in your inbox at <b>{user.email}</b>.</span>
              <button type="button" className="acc-link" disabled={Boolean(resent)} onClick={async () => { try { await call('resend'); setResent('Sent. Check your inbox (and spam).') } catch (e) { setResent(e.message) } }}>{resent || 'Send it again'}</button>
            </div>
          )}
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            {tab !== 'overview' && (
              <div className="acct2-head">
                <h2 className="display">{TABS.find(([k]) => k === tab)[1]}</h2>
                <p>{LEADS[tab]}</p>
              </div>
            )}
            {tab === 'overview' && <Overview orders={orders} go={go} />}
            {tab === 'orders' && <Orders orders={orders} problem={problem} />}
            {tab === 'saved' && <Saved />}
            {tab === 'details' && <Details owned={owned} />}
            {tab === 'security' && <Security />}
          </motion.div>
        </div>
      </div>
    </Page>
  )
}

/* ---------- the routes under /account ---------- */
export default function Account() {
  const { ready, on } = useAccount()
  if (!ready) return <Page title="Your account"><div className="page-head container"><p className="acc-wait">One moment…</p></div></Page>
  if (!on) return (
    <Shell title="Accounts are coming" label="Your account" lead={`Accounts are not open yet. You can still buy as a guest${brand.email ? `, or write to ${brand.email}` : ''}.`}>
      <Link className="btn sm" to="/shop">Go to the Shop <span className="arrow">→</span></Link>
    </Shell>
  )
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route path="forgot" element={<Forgot />} />
      <Route path="reset" element={<Reset />} />
      <Route path="verify" element={<Verify />} />
      <Route path="*" element={<Navigate to="/account" replace />} />
    </Routes>
  )
}
