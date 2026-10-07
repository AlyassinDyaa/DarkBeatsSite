import { useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Page from '../components/Page'
import { brand, money } from '../data/site'
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
function Shell({ title, label, lead, children, wide = false }) {
  return (
    <Page title={title}>
      <header className="page-head container acc-head">
        <div className="label accent">{label}</div>
        <h1 className="display h-xl">{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </header>
      <section className="section tight">
        <div className={`container ${wide ? 'acc-wide' : 'acc-narrow'}`}>{children}</div>
      </section>
    </Page>
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
    <Shell title="Make an account" label="Your account" lead="Keep your cart, follow your orders, and buy faster next time.">
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

/* ---------- the account ---------- */
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
        {o.items.map((i, n) => <li key={n}><span>{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}</span>{i.amount != null && <b>{priced(i.amount, o.currency)}</b>}</li>)}
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

function Orders() {
  const { call, user } = useAccount()
  const [orders, setOrders] = useState(null)
  const [problem, setProblem] = useState('')
  const verified = Boolean(user && user.verified) // confirming the email can bring more orders
  useEffect(() => {
    let stale = false
    call('orders').then((s) => { if (!stale) setOrders(s.orders || []) }).catch((e) => { if (!stale) setProblem(e.message) })
    return () => { stale = true }
  }, [call, verified])
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

function Details() {
  const { user, call } = useAccount()
  const f = useForm({ name: user.name, phone: user.phone, marketing: user.marketing })
  const [saved, setSaved] = useState(false)
  return (
    <form className="acc-card" onSubmit={(e) => f.run(e, async () => { await call('profile', f.values); setSaved(true); setTimeout(() => setSaved(false), 2500) })} noValidate>
      <div className="acc-static"><span className="label">Email</span><b>{user.email}</b>{user.verified ? <small className="acc-ok">Confirmed</small> : <small>Not confirmed yet</small>}</div>
      <Field label="Your name" autoComplete="name" value={f.values.name} onChange={f.set('name')} required={false} maxLength={80} />
      <Field label="Phone (optional, for the courier)" type="tel" autoComplete="tel" value={f.values.phone} onChange={f.set('phone')} required={false} maxLength={30} />
      <label className="acc-check">
        <input type="checkbox" checked={f.values.marketing} onChange={(e) => f.set('marketing')(e.target.checked)} />
        <span>Email me about new prints and conventions.</span>
      </label>
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
  const [busyAll, setBusyAll] = useState(false)
  return (
    <div className="acc-stack">
      <form className="acc-card" onSubmit={(e) => pw.run(e, async () => { await call('password', pw.values); setChanged(true); pw.set('current')(''); pw.set('password')('') })} noValidate>
        <h3 className="acc-h3">Change the password</h3>
        <Field label="Current password" type="password" autoComplete="current-password" value={pw.values.current} onChange={pw.set('current')} error={errorFor(pw.problem, 'current')} />
        <Field label="New password" type="password" autoComplete="new-password" value={pw.values.password} onChange={pw.set('password')} error={errorFor(pw.problem, 'password')} hint="At least 8 characters." />
        <Problem text={pw.problem.field ? '' : pw.problem.text} />
        <div className="acc-row"><Submit busy={pw.busy}>Change it</Submit>{changed && <span className="acc-saved" role="status">Changed. Any other device was logged out.</span>}</div>
      </form>
      <div className="acc-card">
        <h3 className="acc-h3">Log out everywhere</h3>
        <p className="acc-p">Lost a phone, or logged in on a shared computer? This logs out every device, this one too.</p>
        <button type="button" className="btn ghost sm" disabled={busyAll} onClick={async () => { setBusyAll(true); try { await call('everywhere'); navigate('/account/login', { replace: true }) } catch { setBusyAll(false) } }}>{busyAll ? 'One moment…' : 'Log out of every device'}</button>
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

const TABS = [['orders', 'Orders'], ['details', 'Details'], ['security', 'Security']]
function Home() {
  const { user, call } = useAccount()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'orders'
  const [resent, setResent] = useState('')
  if (!user) return <Navigate to="/account/login?next=/account" replace />
  const first = (user.name || '').split(' ')[0]
  const note = params.get('welcome') ? `Welcome${first ? `, ${first}` : ''}. Your account is ready.` : params.get('reset') ? 'Your new password is saved, and you are logged in.' : ''
  return (
    <Shell title={first ? `Hi, ${first}` : 'Your account'} label="Your account" wide>
      {note && <p className="acc-welcome" role="status">{note}</p>}
      {!user.verified && (
        <div className="acc-verify" role="status">
          <span>Confirm your email: there is a link in your inbox at <b>{user.email}</b>.</span>
          <button type="button" className="acc-link" disabled={Boolean(resent)} onClick={async () => { try { await call('resend'); setResent('Sent. Check your inbox (and spam).') } catch (e) { setResent(e.message) } }}>{resent || 'Send it again'}</button>
        </div>
      )}
      <div className="acc-bar">
        <div className="acc-tabs" role="tablist" aria-label="Your account">
          {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams(k === 'orders' ? {} : { tab: k }, { replace: true })}>{label}</button>)}
        </div>
        <button type="button" className="acc-link" onClick={async () => { await call('logout').catch(() => {}); navigate('/', { replace: true }) }}>Log out</button>
      </div>
      <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
        {tab === 'orders' ? <Orders /> : tab === 'details' ? <Details /> : <Security />}
      </motion.div>
    </Shell>
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
