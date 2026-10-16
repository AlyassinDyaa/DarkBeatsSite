import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Page from '../components/Page'
import { accountPage, asset, brand, canBuy, faceLook, money, priceOf, priceVaries, shop, shows, soldOut, work } from '../data/site'
import Poster from '../components/Poster'
import Wordmark from '../components/Wordmark'
import { useAccount } from '../hooks/useAccount'
import { useCart } from '../hooks/useCart'
import AccountCommissions, { useCommissionList } from '../components/AccountCommissions'
import PhoneField from '../components/PhoneField'
import { useMedia } from '../hooks/useMedia'

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
function Shell({ title, label, lead, children, cardName, cardPoints }) {
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
        <AuthArt cardName={cardName} cardPoints={cardPoints} />
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
/* Rewards: how each is earned, whether this customer has, and the card design they chose. */
const earnText = (r) => (r.earnedBy === 'verify' ? 'Confirm your email' : r.earnedBy === 'orders' ? (r.count === 1 ? 'Place your first order' : `Place ${r.count} orders`) : r.earnedBy === 'commissions' ? (r.count === 1 ? 'Commission a piece' : `Commission ${r.count} pieces`) : `Collect ${r.count} prints`)
// commissions are counted apart from the shop's orders and prints (paid, not refunded, still in the account)
const hasEarned = (r, p) => Boolean(p) && ((p.gifts || []).includes(r.id) || (r.earnedBy === 'verify' ? p.verified : r.earnedBy === 'orders' ? p.orders >= r.count : r.earnedBy === 'commissions' ? (p.commissions || 0) >= r.count : p.pieces >= r.count))
const cardDesigns = () => accountPage.rewards.filter((r) => r.kind === 'card')
export const designOf = (id) => cardDesigns().find((r) => r.id === id) || null
// a design's picture, placed and zoomed as the admin set it (the card's ::before draws it)
// a card design's picture as cards show it: the same upload without the logo (vite.config.js, uploads/card)
const cardPic = (p) => (typeof p === 'string' && p.startsWith('/uploads/') ? `/uploads/card/${p.slice(9)}` : p)
const designStyle = (d) => {
  if (!d || !d.cardArt) return undefined
  const c = d.cardCrop || { x: 50, y: 25, zoom: 100 }
  return { '--card-art': `url("${asset(cardPic(d.cardArt))}")`, '--art-x': `${c.x}%`, '--art-y': `${c.y}%`, '--art-z': c.zoom / 100 }
}

/* the collector card: the name, the year they joined, a card number, and what they have collected;
   in the design they chose (a reward), or the site's own purple */
/* The collector card, a real card with two sides: the front (the name, the year they joined, the
   number, what they have collected) and the back (a stripe, their signature, a hologram, the number
   again as a barcode, the small print). It leans toward the pointer; a tap or click turns it over,
   and a drag spins it round by hand, settling on whichever side is nearer when let go.
   The back never borrows the front's picture: it is the design's own back picture (set in the
   admin), or else the card's look (the site's purple, ink, gold or chrome). */
const EDGE = [-3, -2, -1, 0, 1, 2, 3] // the slices of the card's body, from its back face to its front
const backStyle = (d) => (d && d.cardBack ? { '--card-art': `url("${asset(cardPic(d.cardBack))}")`, '--art-x': '50%', '--art-y': '50%', '--art-z': 1 } : undefined)
// the barcode on the back, made from the member number: the same bars for the same number every time
const barsOf = (number) => {
  const digits = String(number || '').replace(/\D/g, '').padStart(4, '0')
  const seq = `${digits}${[...digits].reverse().join('')}7319${digits}`.split('').map(Number)
  const stops = []
  let x = 0
  seq.forEach((n, i) => {
    const w = 2 * (1 + (n % 3))
    const gap = 2 * (1 + ((n + i) % 2))
    stops.push(`currentColor ${x}px ${x + w}px`, `transparent ${x + w}px ${x + w + gap}px`)
    x += w + gap
  })
  return { backgroundImage: `linear-gradient(90deg, ${stops.join(', ')})`, width: `${x}px` }
}
export function CollectorCard({ name, since, number, prints, points: given = 0, earned = null, design = null }) {
  const points = accountPage.points && accountPage.points.on ? given : null // points switched off: none on the card
  const lean = useRef(null)
  const flip = useRef(null)
  const turn = useRef(0) // how far round it is turned, in degrees: 0 the front, 180 the back, 360 the front again
  const drag = useRef(null)
  const [back, setBack] = useState(false)
  const setTurn = (deg, moving = false) => {
    turn.current = deg
    const el = flip.current
    if (el) { el.style.setProperty('--turn', `${deg}deg`); el.classList.toggle('is-dragging', moving) }
    setBack(Math.abs(Math.round(deg / 180)) % 2 === 1)
  }
  const settle = () => Math.round(turn.current / 180) * 180
  const turnOver = () => setTurn(settle() + 180)
  // the card leans toward the pointer, or the finger resting on it, and the band of light follows it; not while it is being spun
  const leanTo = (e) => {
    const el = lean.current
    if (!el || (drag.current && drag.current.moved)) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    el.style.setProperty('--rx', `${(y - 0.5) * -10}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`)
    el.style.setProperty('--mx', `${x * 100}%`)
  }
  const rest = (force = false) => {
    const el = lean.current
    if (!el || (drag.current && !force)) return
    for (const k of ['--rx', '--ry', '--mx']) el.style.removeProperty(k)
    el.classList.remove('is-touched')
  }
  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return
    drag.current = { x: e.clientX, from: turn.current, moved: false, id: e.pointerId }
    if (e.pointerType === 'touch' && lean.current) { lean.current.classList.add('is-touched'); leanTo(e) }
  }
  const move = (e) => {
    const d = drag.current
    if (!d) { if (e.pointerType !== 'touch') leanTo(e); return }
    const dx = e.clientX - d.x
    if (!d.moved) {
      leanTo(e)
      if (Math.abs(dx) < 6) return
      d.moved = true // from here it is a spin: the lean lets go and the card turns with the hand
      rest(true)
      try { flip.current.setPointerCapture(d.id) } catch { /* fine */ }
    }
    setTurn(d.from + dx * 0.55, true)
  }
  const up = (e) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) setTurn(settle())
    else turnOver()
    if (e.pointerType === 'touch') rest()
  }
  const shown = (name || '').trim()
  const look = design ? `is-${design.cardLook}` : ''
  const host = typeof window !== 'undefined' ? window.location.host : ''
  return (
    <div className="acc-card3d-wrap" onPointerLeave={() => rest()} role="group" aria-label={`${brand.name} collector card${shown ? ` for ${shown}` : ''}, ${back ? 'the back' : 'the front'}`}>
      <div ref={lean} className="acc-card3d-lean">
        <div ref={flip} className="acc-card3d-flip" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {/* the card's thickness: slices between the faces, seen edge-on while it turns or leans */}
          {EDGE.map((z) => <span key={z} className={`acc-card3d-edge ${look}`} style={{ '--z': z }} aria-hidden="true" />)}
          <div className={`acc-card3d is-front ${look} ${design && design.cardArt ? 'has-art' : ''}`} style={designStyle(design)} aria-hidden={back}>
            <span className="acc-card3d-shine" />
            <span className="acc-card3d-mark" aria-hidden="true">J</span>
            <div className="acc-card3d-top">
              <span className="acc-card3d-brand">{brand.logo && <img src={asset(brand.logo)} alt="" draggable="false" />}<Wordmark /></span>
              <span className="acc-card3d-kind">Collector</span>
            </div>
            <span className="acc-card3d-chip" aria-hidden="true" />
            <div className={`acc-card3d-name ${shown ? '' : 'is-empty'}`}>{shown || 'Your name here'}</div>
            <div className="acc-card3d-foot">
              <span><small>Member since</small>{since}</span>
              <span><small>Member no.</small>{number}</span>
              {points != null && <span><small>Points</small>{points}</span>}
              <span><small>Prints</small>{prints}</span>
            </div>
          </div>
          <div className={`acc-card3d acc-card3d-back ${look} ${design && design.cardBack ? 'has-art' : ''}`} style={backStyle(design)} aria-hidden={!back}>
            <span className="acc-card3d-shine" />
            <span className="acc-card3d-stripe" aria-hidden="true" />
            <div className="acc-card3d-sign">
              <span className="acc-card3d-sign-strip"><i>{shown || 'Your name'}</i></span>
              <span className="acc-card3d-holo" aria-hidden="true"><b>J</b></span>
            </div>
            <small className="acc-card3d-sign-label">Collector’s signature</small>
            <div className="acc-card3d-facts">
              <span><small>Member no.</small>{number}</span>
              <span><small>Since</small>{since}</span>
              {points != null && <span><small>Total earned</small>{earned == null ? points : earned}</span>}
              <span><small>Prints</small>{prints}</span>
            </div>
            <div className="acc-card3d-base">
              <span className="acc-card3d-bars" style={barsOf(number)} aria-hidden="true" />
              <p>Original art by {brand.name}. This card belongs to its member{host ? ` · ${host}` : ''}</p>
            </div>
          </div>
        </div>
      </div>
      <button type="button" className="acc-card3d-turn" onClick={turnOver} aria-label={back ? 'Turn the card to its front' : 'Turn the card over'}>
        <span aria-hidden="true">↻</span> {back ? 'See the front' : 'Turn over'}
      </button>
    </div>
  )
}
// the same four digits for the same customer, every time
// member 1 reads #0001
export const memberNumber = (n) => (n ? `#${String(n).padStart(4, '0')}` : '#----')

// the card beside the forms: logged in, their own; making an account, the name as it is typed and
// the points the details earn as they are filled in
function AuthArt({ cardName, cardPoints = 0 }) {
  const { user } = useAccount()
  return (
    <aside className="acc-art">
      {user
        ? <CollectorCard name={user.name || user.email.split('@')[0]} since={new Date(user.createdAt).getFullYear()} number={memberNumber(user.memberNo)} prints="Your collection" points={user.points || 0} earned={user.pointsEarned || 0} design={designOf(user.card)} />
        : <CollectorCard name={cardName} since={new Date().getFullYear()} number={memberNumber(null)} prints="Your collection" points={cardPoints} />}
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
    <Shell title="Log in" label="Your account" lead={params.get('confirmed') ? 'Your email is confirmed. Log in to see your account.' : 'Your orders, their tracking, and your cart on every device.'}>
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
  const f = useForm({ name: '', phone: '', email: '', password: '', marketing: false })
  // what the details typed so far earn (the password counts twice), shown on the card beside the form
  const pts = accountPage.points
  const cardPoints = pts.on ? pts.field * (['name', 'phone', 'email'].filter((k) => String(f.values[k] || '').trim()).length + (f.values.password ? 2 : 0)) : null
  const made = useRef(false) // just made here: the account page greets them
  if (user) return <Navigate to={made.current && next === '/account' ? '/account?welcome=1' : next} replace />
  return (
    <Shell title="Make an account" label="Your account" lead="Keep your cart, follow your orders, and buy faster next time." cardName={f.values.name} cardPoints={cardPoints}>
      <form className="acc-card" onSubmit={(e) => f.run(e, async () => { made.current = true; await call('signup', { ...f.values, cart: cart.stored }); navigate(next === '/account' ? '/account?welcome=1' : next, { replace: true }) })} noValidate>
        <Field label="Your name" autoComplete="name" value={f.values.name} onChange={f.set('name')} required={false} maxLength={80} />
        <PhoneField label="Phone (optional)" value={f.values.phone} onChange={f.set('phone')} error={errorFor(f.problem, 'phone')} />
        <Field label="Email" type="email" autoComplete="email" value={f.values.email} onChange={f.set('email')} error={errorFor(f.problem, 'email')} />
        <Field label="Password" type="password" autoComplete="new-password" value={f.values.password} onChange={f.set('password')} error={errorFor(f.problem, 'password')} hint="At least 8 characters." />
        <label className="acc-check">
          <input type="checkbox" checked={f.values.marketing} onChange={(e) => f.set('marketing')(e.target.checked)} />
          <span>Email me about new prints and conventions. (Now and then; never shared.){newsBonusLine(', once your email is confirmed')}</span>
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
  const navigate = useNavigate()
  useEffect(() => {
    if (!token) return
    let stale = false
    call('verify', { token }).then((s) => {
      if (stale) return
      const got = Array.isArray(s.rewards) ? s.rewards : []
      // confirmed: on to their account, which says so (logged out, on another device say: log in first)
      const there = `/account?confirmed=${got.length ? 'reward' : '1'}`
      if (s.user) navigate(there, { replace: true })
      else navigate(`/account/login?next=${encodeURIComponent(there)}&confirmed=1`, { replace: true })
      setState('done')
    }).catch((e) => { if (!stale) { setState('failed'); setText(e.message) } })
    return () => { stale = true }
  }, [token, call, navigate])
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

/* ---------- no more news emails, from the link at the foot of a mass email (no login needed) ---------- */
function Unsubscribe() {
  const { call, user } = useAccount()
  const [params] = useSearchParams()
  const u = params.get('u') || ''
  const t = params.get('t') || ''
  const [state, setState] = useState(u && t ? 'working' : 'missing')
  const [text, setText] = useState('')
  const [lost, setLost] = useState(0)
  useEffect(() => {
    if (!u || !t) return
    let stale = false
    call('unsubscribe', { u, t }).then((r) => { if (!stale) { setLost(Number(r && r.pointsTaken) || 0); setState('done') } }).catch((e) => { if (!stale) { setState('failed'); setText(e.message) } })
    return () => { stale = true }
  }, [u, t, call])
  const details = '/account?tab=details'
  return (
    <Shell title={state === 'done' ? 'You are unsubscribed' : 'Unsubscribe'} label="News emails">
      <div className={`acc-card acc-done ${state === 'failed' || state === 'missing' ? 'is-bad' : ''}`} role="status">
        <i aria-hidden="true">{state === 'done' ? '✓' : state === 'working' ? '…' : '!'}</i>
        <p>{state === 'working' ? 'One moment…' : state === 'done' ? `You won’t get news emails any more. Emails about your orders and your account still come as usual.${lost ? ` The ${lost} ${accountPage.points.name} you got for saying yes to news were taken back, and are not given again if you resubscribe.` : ''} Changed your mind? Turn news back on under Details in your account.` : state === 'missing' ? 'This page needs the link from the email. You can also turn news emails off under Details in your account.' : text}</p>
        <Link className="btn ghost sm" to={user ? details : `/account/login?next=${encodeURIComponent(details)}`}>{state === 'done' ? 'Resubscribe in Details' : 'Go to Details'} <span className="arrow">→</span></Link>
      </div>
    </Shell>
  )
}

/* ---------- a gift accepted from the button in its email (/account/gift?u=…&t=…): it goes into the
   account, and the page says what it was and where to find it */
function AcceptGift() {
  const { call, user } = useAccount()
  const [params] = useSearchParams()
  const u = params.get('u') || ''
  const t = params.get('t') || ''
  const [state, setState] = useState(u && t ? 'working' : 'missing')
  const [text, setText] = useState('')
  const [got, setGot] = useState(null)
  useEffect(() => {
    if (!u || !t) return
    let stale = false
    call('acceptGift', { u, t }).then((r) => { if (!stale) { setGot(r); setState('done') } }).catch((e) => { if (!stale) { setState('failed'); setText(e.message) } })
    return () => { stale = true }
  }, [u, t, call])
  const where = got && (got.kind === 'picture' || got.kind === 'card') ? '/account?tab=details' : '/account?tab=rewards'
  return (
    <Shell title={state === 'done' ? 'It is yours' : 'Your gift'} label="A gift from Jordan">
      <div className={`acc-card acc-done ${state === 'failed' || state === 'missing' ? 'is-bad' : ''}`} role="status">
        <i aria-hidden="true">{state === 'done' ? '✓' : state === 'working' ? '…' : '!'}</i>
        <p>{state === 'working' ? 'One moment…' : state === 'done' ? `${got.name || 'Your gift'} is now in your account.${got.kind === 'discount' ? ' Its code is under Rewards, ready for your next order.' : got.kind ? ' Use it from Details in your account.' : ''}` : state === 'missing' ? 'This page needs the link from the gift email.' : text}</p>
        <Link className="btn sm" to={user ? where : `/account/login?next=${encodeURIComponent(where)}`}>{state === 'done' ? (got.kind === 'picture' || got.kind === 'card' ? 'Use it now' : 'See your rewards') : 'Go to your account'} <span className="arrow">→</span></Link>
      </div>
    </Shell>
  )
}

/* ---------- a gift from the admin, not seen yet: a window over the account page with each reward
   (its picture, card design or discount), a way to see them under Rewards, and a close button.
   Closing it in any way (the cross, Escape, a click outside) marks the gifts seen. */
function GiftPopup({ gifts, onSee, onClose }) {
  const open = gifts.length > 0
  const seeBtn = useRef(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', key)
    const t = setTimeout(() => seeBtn.current?.focus(), 80)
    window.__lenis?.stop?.()
    return () => { removeEventListener('keydown', key); clearTimeout(t); window.__lenis?.start?.(); before?.focus?.() }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="acc-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div className="acc-modal-box acct-gift-pop" role="dialog" aria-modal="true" aria-labelledby="acct-gift-title" initial={{ opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.4, ease: EASE }}>
            <button type="button" className="acc-modal-x" onClick={onClose} aria-label="Close">×</button>
            <span className="acct-gift-pop-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9h16v4H4z M5 13h14v8H5z M12 9v12 M12 9c-2-4-6-4-6-1.500S9 9 12 9z M12 9c2-4 6-4 6-1.500S15 9 12 9z" /></svg></span>
            <span className="label accent">From {brand.name}</span>
            <h2 id="acct-gift-title">{gifts.length === 1 ? 'A gift for you' : `${gifts.length} gifts for you`}</h2>
            <p>{gifts.length === 1 ? 'This is now yours, in your account.' : 'These are now yours, in your account.'}</p>
            <ul className="acct-gift-pop-list">
              {gifts.map((r) => (
                <li key={r.id}>
                  <span className="acct-reward-art" aria-hidden="true">
                    {r.kind === 'picture' && r.picture && <span className="acct-pick-pic"><img src={asset(r.picture)} alt="" style={faceLook(r)} /></span>}
                    {r.kind === 'card' && <span className={`acct-card-mini is-${r.cardLook} ${r.cardArt ? 'has-art' : ''}`} style={designStyle(r)}><b>J</b><i /></span>}
                    {r.kind === 'discount' && <span className="acct-reward-off"><b>{r.percent}%</b><small>off</small></span>}
                  </span>
                  <span className="acct-gift-pop-what">
                    <small>{r.kind === 'picture' ? 'Profile picture' : r.kind === 'card' ? 'Card design' : r.code ? 'Discount code' : 'Discount'}</small>
                    <strong>{r.name}</strong>
                    <span>{r.kind === 'picture' ? 'Choose it under Details.' : r.kind === 'card' ? 'Put it on your card under Details.' : r.code ? 'A discount code: it is under Rewards, ready for your cart.' : 'Your code is under Rewards.'}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="acc-modal-actions">
              <button type="button" className="btn ghost sm" onClick={onClose}>Close</button>
              <button ref={seeBtn} type="button" className="btn sm" onClick={onSee}>See my rewards <span className="arrow">→</span></button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- "are you sure?": a small window over the page. Escape, the cross or a click outside
   says no; the answer button runs the action and shows that it is working. */
function Confirm({ open, title, text, yes, onYes, onClose, no = 'Stay logged in', busyText = 'Logging out…', danger = false, icon = 'out' }) {
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
          <motion.div className={`acc-modal-box ${danger ? 'is-danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="acc-modal-title" aria-describedby="acc-modal-text" initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3, ease: EASE }}>
            <button type="button" className="acc-modal-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
            <span className="acc-modal-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={icon === 'mail' ? 'M3 6h18v12H3z M3 7l9 6 9-6' : icon === 'key' ? 'M15 7a4 4 0 1 1-4 4 M11 11l-7 7 M7 15l2 2 M5 17l2 2' : icon === 'bin' ? 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6' : 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10'} /></svg></span>
            <h2 id="acc-modal-title">{title}</h2>
            <p id="acc-modal-text">{text}</p>
            <div className="acc-modal-actions">
              <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>{no}</button>
              <button ref={yesBtn} type="button" className="btn sm acc-modal-yes" disabled={busy} onClick={async () => { setBusy(true); try { await onYes() } finally { setBusy(false) } }}>{busy ? busyText : yes}</button>
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
/* The prints a customer holds: from their shop orders, leaving out refunded ones (orders the admin
   deleted never reach the page). The member card, the profile line and their pictures use these. */
const keptOrders = (orders) => (orders || []).filter((o) => o.kind !== 'support' && o.status !== 'refunded')
const printsIn = (orders) => keptOrders(orders).reduce((n, o) => n + o.items.reduce((m, i) => m + (i.qty || 1), 0), 0)
// a piece taken off the site since keeps the picture its order saved
const pieceOrSaved = (i) => pieceFor(i.name) || (i.slug && i.src ? { slug: i.slug, title: i.title || i.name, src: i.src, face: { x: 50, y: 22, zoom: 100 }, gone: true } : null)
const ownedIn = (orders) => [...new Map(keptOrders(orders).flatMap((o) => o.items.map(pieceOrSaved)).filter(Boolean).map((p) => [p.slug, p])).values()]
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late' }
const monthYear = (d) => new Date(d).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
const initialsOf = (u) => ((u.name || u.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''))

/* the customer's picture: one of the artist's pieces they chose, or their initials */
// owned: the prints they bought, for a piece taken off the site since (its order kept the picture)
function Avatar({ user, size = 'md', owned = [] }) {
  const icon = user.avatar && user.avatar.startsWith('icon:') ? user.avatar.slice(5) : ''
  const piece = user.avatar && !icon ? work.find((p) => p.slug === user.avatar && p.src) || owned.find((p) => p.slug === user.avatar && p.src) : null
  return (
    <span className={`acct-avatar is-${size}`} aria-hidden="true">
      {icon ? <img src={asset(icon)} alt="" style={faceLook([...accountPage.icons, ...accountPage.rewards.filter((r) => r.kind === 'picture')].find((i) => i.picture === icon))} /> : piece ? <img src={asset(piece.src)} alt="" style={faceLook(piece)} /> : <b>{initialsOf(user)}</b>}
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

function OrderCard({ o, onRemove, pick = null }) {
  const at = STEPS.findIndex(([k]) => k === o.status)
  const support = o.kind === 'support'
  return (
    <article className="acc-order">
      <header className={`acc-order-head ${pick ? 'is-picking' : ''}`}>
        {pick && (
          <label className="acc-order-pick" title={pick.on ? 'Chosen' : 'Choose it'}>
            <input type="checkbox" checked={pick.on} onChange={pick.toggle} aria-label={`Choose ${support ? 'this support payment' : `order ${o.number}`}`} />
            <span aria-hidden="true" />
          </label>
        )}
        <div>
          <strong>{support ? 'Support' : `Order ${o.number}`}</strong>
          <small>{longDay(o.createdAt)}{o.paidWith ? ` · ${o.paidWith}` : ''}</small>
        </div>
        <span className="acc-order-right">
          <span className={`acc-pill is-${o.status}`}>{support ? 'Thank you' : STATUS_TEXT[o.status] || 'Paid'}</span>
          {onRemove && !pick && (
            <button type="button" className="acc-order-del" onClick={() => onRemove(o)} title="Remove from your account" aria-label={support ? 'Remove this support payment from your account' : `Remove order ${o.number} from your account`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6" /></svg>
            </button>
          )}
        </span>
      </header>
      <ul className="acc-items">
        {o.items.map((i, n) => {
          const p = pieceOrSaved(i)
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
function useOrders(justPaid = false) {
  const { call, user } = useAccount()
  const [orders, setOrders] = useState(null)
  const [problem, setProblem] = useState('')
  const verified = Boolean(user && user.verified) // confirming the email can bring more orders
  useEffect(() => {
    let stale = false
    const ask = () => call('orders').then((s) => { if (!stale) setOrders(s.orders || []) }).catch((e) => { if (!stale) setProblem(e.message) })
    ask()
    // just back from paying: the payment service tells the site a moment later, so ask again a few times
    const later = justPaid ? [2500, 6000, 12000].map((ms) => setTimeout(ask, ms)) : []
    // the admin may post something meanwhile (status, tracking): asked again on coming back to the
    // page, and every half minute while it is in view
    const back = () => { if (document.visibilityState === 'visible') ask() }
    document.addEventListener('visibilitychange', back)
    addEventListener('focus', back)
    const every = setInterval(back, 30000)
    return () => { stale = true; later.forEach(clearTimeout); clearInterval(every); document.removeEventListener('visibilitychange', back); removeEventListener('focus', back) }
  }, [call, verified, justPaid])
  const drop = useCallback((o) => setOrders((list) => (list || []).filter((x) => x !== o)), [])
  return { orders, problem, drop }
}

/* Deleting archived gifts: one, or all of them. Asked first: a code that still works is gone with it. */
function DeleteGifts({ items = [], onClose, onYes }) {
  const open = items.length > 0
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', key)
    const t = setTimeout(() => box.current?.querySelector('.acc-modal-actions .btn.ghost')?.focus(), 60)
    window.__lenis?.stop?.()
    return () => { removeEventListener('keydown', key); clearTimeout(t); window.__lenis?.start?.(); before?.focus?.() }
  }, [open, onClose])
  const one = items.length === 1
  const working = items.filter((x) => x.key.startsWith('code:') && x.works).length
  const kept = items.filter((x) => !x.key.startsWith('code:')).length
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="acc-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div ref={box} className="acc-modal-box" role="alertdialog" aria-modal="true" aria-labelledby="acc-gdel-title" aria-describedby="acc-gdel-text"
            initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3, ease: EASE }}>
            <button type="button" className="acc-modal-x" onClick={onClose} aria-label="Close">×</button>
            <span className="acc-modal-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6" /></svg></span>
            <h2 id="acc-gdel-title">{one ? `Delete ${items[0].name}?` : `Delete all ${items.length} archived gifts?`}</h2>
            <div id="acc-gdel-text" className="acc-del-text">
              {!one && (
                <ul className="acc-del-list">
                  {items.map((x) => <li key={x.key}><b>{x.name}</b><small>{x.note}</small></li>)}
                </ul>
              )}
              <p className="acc-del-warn"><b>This cannot be undone.</b> {one ? 'It leaves' : 'They leave'} your Rewards page for good and cannot be restored.</p>
              {working > 0 && <p>{one ? 'This discount code still works.' : `${working === 1 ? 'One discount code still works' : `${working} discount codes still work`}.`} Once deleted, {working === 1 ? 'it is' : 'they are'} gone from your account, so you will not be able to use {working === 1 ? 'it' : 'them'}.</p>}
              {kept > 0 && <p>{one ? 'This picture or card design stays yours' : 'Gifted pictures and card designs stay yours'}: you can still choose {kept === 1 ? 'it' : 'them'} under Details.</p>}
            </div>
            <div className="acc-modal-actions">
              <button type="button" className="btn ghost sm" onClick={onClose}>Keep {one ? 'it' : 'them'}</button>
              <button type="button" className="btn sm acc-modal-yes" onClick={() => { onYes(items); onClose() }}>{one ? 'Delete' : `Delete all ${items.length}`}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* Removing an order from the account: only with the password. The shop keeps its own record. */
function RemoveOrder({ orders = [], onClose, onRemoved }) {
  const { call, user } = useAccount()
  const f = useForm({ password: '' })
  const open = orders.length > 0
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', key)
    const t = setTimeout(() => box.current?.querySelector('input')?.focus(), 60)
    window.__lenis?.stop?.()
    return () => { removeEventListener('keydown', key); clearTimeout(t); window.__lenis?.start?.(); before?.focus?.() }
  }, [open, onClose])
  const one = orders.length === 1
  const onTheWay = orders.filter((o) => !['delivered', 'refunded'].includes(o.status) && o.kind !== 'support').length
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="acc-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => { if (e.target === e.currentTarget && !f.busy) onClose() }}>
          <motion.form ref={box} className="acc-modal-box" role="alertdialog" aria-modal="true" aria-labelledby="acc-del-title" aria-describedby="acc-del-text" noValidate
            initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3, ease: EASE }}
            onSubmit={(e) => f.run(e, async () => { await call('removeOrders', { numbers: orders.map((o) => o.number), password: f.values.password }); f.set('password')(''); onRemoved(orders) })}>
            <button type="button" className="acc-modal-x" onClick={onClose} aria-label="Close" disabled={f.busy}>×</button>
            <span className="acc-modal-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6" /></svg></span>
            <h2 id="acc-del-title">{one ? (orders[0].kind === 'support' ? 'Delete this support payment?' : `Delete order ${orders[0].number}?`) : `Delete ${orders.length} orders?`}</h2>
            <div id="acc-del-text" className="acc-del-text">
              <p className="acc-del-warn"><b>This cannot be undone.</b> {one ? 'It leaves' : 'They leave'} your account for good: {one ? 'its' : 'their'} items, tracking and details will no longer show here.</p>
              {orders.some((o) => o.kind !== 'support' && o.status !== 'refunded') && <p>{one ? 'It' : 'They'} will no longer count toward your rewards, your member card or your collection: rewards earned by orders or prints are kept only while you still have enough. Discount codes you already have keep working.</p>}
              {onTheWay > 0 && <p>{one ? 'It has' : onTheWay === orders.length ? 'They have' : `${onTheWay} of them ${onTheWay === 1 ? 'has' : 'have'}`} not reached you yet: still posted to you, but the tracking will only be in the copy.</p>}
              <p className="acc-del-copy"><span aria-hidden="true">✉</span> First, a copy of {one ? 'it' : 'each'} is emailed to you at <b>{user.email}</b>. If the copy cannot be sent, nothing is deleted.</p>
              <p>The shop keeps its own record of every sale. Type your password to be sure.</p>
            </div>
            <div className="acc-modal-field">
              <Field label="Your password" type="password" autoComplete="current-password" value={f.values.password} onChange={f.set('password')} error={errorFor(f.problem, 'password')} />
            </div>
            <Problem text={f.problem.field ? '' : f.problem.text} />
            <div className="acc-modal-actions">
              <button type="button" className="btn ghost sm" onClick={onClose} disabled={f.busy}>Keep {one ? 'it' : 'them'}</button>
              <button type="submit" className="btn sm acc-modal-yes" disabled={f.busy || !f.values.password}>{f.busy ? 'Emailing the copy…' : one ? 'Delete and email me a copy' : `Delete ${orders.length} and email me a copy`}</button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* The ways to look at the orders: which ones (all, on the way, delivered, refunded) and how (in
   full, or a short list where each opens in place). The chosen look is kept on this device. */
const ORDER_SHOWS = [
  ['all', 'All', () => true],
  ['going', 'On the way', (o) => ['new', 'packed', 'shipped'].includes(o.status) && o.kind !== 'support'],
  ['delivered', 'Delivered', (o) => o.status === 'delivered'],
  ['refunded', 'Refunded', (o) => o.status === 'refunded'],
  ['support', 'Support', (o) => o.kind === 'support'],
]
const LOOK_KEY = 'jb.ordersLook'
const readLook = () => { try { return localStorage.getItem(LOOK_KEY) === 'list' ? 'list' : 'cards' } catch { return 'cards' } }

function OrderRow({ o, open, onToggle, pick = null }) {
  const support = o.kind === 'support'
  const pics = o.items.map(pieceOrSaved).filter((p) => p && p.src).slice(0, 3)
  const count = o.items.reduce((n, i) => n + (i.qty || 1), 0)
  return (
    <button type="button" className={`acc-orow ${open ? 'is-open' : ''} ${pick ? 'is-picking' : ''} ${pick && pick.on ? 'is-picked' : ''}`} aria-expanded={pick ? undefined : open} aria-pressed={pick ? pick.on : undefined} onClick={pick ? pick.toggle : onToggle}>
      {pick && <span className="acc-orow-tick" aria-hidden="true" />}
      <span className="acc-orow-pics" aria-hidden="true">
        {pics.length ? pics.map((p, n) => <img key={n} src={asset(p.src)} alt="" />) : <i />}
      </span>
      <span className="acc-orow-what">
        <strong>{support ? 'Support' : `Order ${o.number}`}</strong>
        <small>{longDay(o.createdAt)} · {count} {count === 1 ? 'item' : 'items'}{o.paidWith ? ` · ${o.paidWith}` : ''}</small>
      </span>
      <span className={`acc-pill is-${o.status}`}>{support ? 'Thank you' : STATUS_TEXT[o.status] || 'Paid'}</span>
      <b className="acc-orow-total">{priced(o.amount, o.currency)}</b>
      <svg className="acc-orow-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
  )
}

function Orders({ orders, problem, onRemoved }) {
  const { user } = useAccount()
  const [removing, setRemoving] = useState([]) // the orders the delete window is for
  const close = useCallback(() => setRemoving([]), [])
  const [picking, setPicking] = useState(false) // choosing orders to delete
  const [picked, setPicked] = useState(() => new Set())
  const [done, setDone] = useState('')
  const [show, setShow] = useState('all')
  const [look, setLook] = useState(readLook)
  const [opened, setOpened] = useState(() => new Set())
  const chooseLook = (v) => { setLook(v); try { localStorage.setItem(LOOK_KEY, v) } catch { /* only for this visit */ } }
  const toggle = (key) => setOpened((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  if (problem) return <p className="acc-problem">{problem}</p>
  if (!orders) return <p className="acc-wait">Fetching your orders…</p>
  if (!orders.length) return (
    <div className="acc-empty">
      <strong>No orders yet</strong>
      <p>{user.verified ? 'When you buy a print, it shows here with its tracking.' : 'Orders placed while logged in show here. Confirm your email to see any placed with it before.'}</p>
      <Link className="btn sm" to="/shop">Go to the Shop <span className="arrow">→</span></Link>
    </div>
  )
  const counts = Object.fromEntries(ORDER_SHOWS.map(([k, , fits]) => [k, orders.filter(fits).length]))
  const fits = (ORDER_SHOWS.find(([k]) => k === show) || ORDER_SHOWS[0])[2]
  const shown = orders.filter(fits)
  const keyOf = (o) => `${o.number}${o.createdAt}`
  const pickOf = (o) => (picking ? { on: picked.has(keyOf(o)), toggle: () => setPicked((s) => { const n = new Set(s); if (n.has(keyOf(o))) n.delete(keyOf(o)); else n.add(keyOf(o)); return n }) } : null)
  const allPicked = shown.length > 0 && shown.every((o) => picked.has(keyOf(o)))
  const chosen = orders.filter((o) => picked.has(keyOf(o)))
  const stopPicking = () => { setPicking(false); setPicked(new Set()) }
  const removed = (list) => {
    setRemoving([]); stopPicking()
    list.forEach((o) => onRemoved(o))
    setDone(`${list.length === 1 ? 'Deleted.' : `${list.length} orders deleted.`} A copy is on its way to ${user.email}.`)
    setTimeout(() => setDone(''), 6000)
  }
  return (
    <>
      <div className="acc-otools">
        <div className="acc-oshow" role="tablist" aria-label="Which orders">
          {ORDER_SHOWS.filter(([k]) => k === 'all' || counts[k] > 0).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={show === k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{label}<small>{counts[k]}</small></button>
          ))}
        </div>
        {onRemoved && !picking && <button type="button" className="acc-oselect" onClick={() => { setPicking(true); setDone('') }}>Select</button>}
        <div className="acc-olook" role="radiogroup" aria-label="How to show them">
          <button type="button" role="radio" aria-checked={look === 'cards'} className={look === 'cards' ? 'on' : ''} onClick={() => chooseLook('cards')} title="In full">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v7H4z M4 14h16v6H4z" /></svg><span>Full</span>
          </button>
          <button type="button" role="radio" aria-checked={look === 'list'} className={look === 'list' ? 'on' : ''} onClick={() => chooseLook('list')} title="A short list">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16 M4 12h16 M4 18h16" /></svg><span>List</span>
          </button>
        </div>
      </div>
      {/* choosing orders to delete: all of them at once, or one by one */}
      {picking && (
        <div className="acc-opick" role="region" aria-label="Choose orders to delete">
          <label className="acc-opick-all">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map(keyOf)))} />
            <span aria-hidden="true" />
            Select all <small>{shown.length}</small>
          </label>
          <span className="acc-opick-count">{picked.size ? `${picked.size} chosen` : 'Tick the orders to delete'}</span>
          <button type="button" className="btn sm acc-modal-yes" disabled={!chosen.length} onClick={() => setRemoving(chosen)}>Delete{chosen.length ? ` ${chosen.length}` : ''}…</button>
          <button type="button" className="btn ghost sm" onClick={stopPicking}>Cancel</button>
        </div>
      )}
      {done && <p className="acc-welcome" role="status">{done}</p>}
      {!shown.length && <p className="acc-wait">None here.</p>}
      {look === 'cards'
        ? <div className="acc-orders">{shown.map((o) => <OrderCard key={keyOf(o)} o={o} pick={pickOf(o)} onRemove={onRemoved ? (x) => setRemoving([x]) : undefined} />)}</div>
        : (
          <div className="acc-olist">
            {shown.map((o) => (
              <div key={keyOf(o)} className="acc-olist-item">
                <OrderRow o={o} open={opened.has(keyOf(o))} onToggle={() => toggle(keyOf(o))} pick={pickOf(o)} />
                {opened.has(keyOf(o)) && !picking && <OrderCard o={o} onRemove={onRemoved ? (x) => setRemoving([x]) : undefined} />}
              </div>
            ))}
          </div>
        )}
      <RemoveOrder orders={removing} onClose={close} onRemoved={removed} />
    </>
  )
}

function Details({ owned = [], progress = null, onPreview = () => {} }) {
  const { user, call } = useAccount()
  const f = useForm({ name: user.name, phone: user.phone, marketing: user.marketing, avatar: user.avatar || '', card: user.card || '' })
  const prog = { verified: Boolean(user.verified), orders: 0, pieces: 0, ...(progress || {}), gifts: user.gifts || [] }
  const rewardPics = accountPage.rewards.filter((r) => r.kind === 'picture')
  const designs = cardDesigns()
  const [saved, setSaved] = useState(false)
  const [resent, setResent] = useState('')
  const mine = owned.filter((p) => p.src)
  // a picture or card design chosen but not saved: shown live at the top of the page and beside the
  // choices (a preview), with a bar asking to keep it or go back; leaving without saving keeps the old one
  const trying = f.values.avatar !== (user.avatar || '') || f.values.card !== (user.card || '')
  const newPic = f.values.avatar !== (user.avatar || '')
  const newCard = f.values.card !== (user.card || '')
  useEffect(() => { onPreview(trying ? { avatar: f.values.avatar, card: f.values.card } : null) }, [trying, f.values.avatar, f.values.card]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const undo = () => { f.set('avatar')(user.avatar || ''); f.set('card')(user.card || '') }
  // the news points they hold (Rewards → Points): unticking news takes them back for good, so it asks first
  const pts = accountPage.points
  const newsHeld = pts.on && pts.news > 0 && user.newsBonus === 'given' ? pts.news : 0
  const newsGone = pts.on && pts.news > 0 && user.newsBonus === 'taken'
  const [askNewsOff, setAskNewsOff] = useState(false)
  const newsBox = (on) => { if (!on && newsHeld && f.values.marketing) { setAskNewsOff(true); return } f.set('marketing')(on) }
  const submit = (e) => f.run(e, async () => { await call('profile', f.values); setSaved(true); setTimeout(() => setSaved(false), 2500) })
  return (
    <form className="acc-card" onSubmit={submit} noValidate>
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
        <PhoneField label="Phone (optional)" value={f.values.phone || ''} onChange={f.set('phone')} error={errorFor(f.problem, 'phone')} />
      </div>
      <label className="acc-check">
        <input type="checkbox" checked={f.values.marketing} onChange={(e) => newsBox(e.target.checked)} />
        <span>Email me about new prints and conventions. You can stop any time.{newsGone || newsHeld ? null : newsBonusLine()}</span>
      </label>
      {/* unticked but not saved yet, while they hold the points: what saving does */}
      {newsHeld > 0 && !f.values.marketing && user.marketing && <p className="acc-news-warn" role="status">Saving this takes back your {newsHeld} {pts.name} for news, and saying yes again later will not give them back.</p>}
      {/* lost once already: saying yes again is welcome, without the points */}
      {newsGone && !user.marketing && <p className="acc-news-note">The {pts.name} for news were given once already, so saying yes again does not bring them back.</p>}
      <Confirm open={askNewsOff} title="Stop news emails?" text={`You got ${newsHeld} ${pts.name} for saying yes to news. Stopping takes them back, and saying yes again later will not give them back.`} yes={`Stop news (−${newsHeld} ${pts.name})`} no="Keep news" busyText="One moment…" icon="mail" danger
        onClose={() => setAskNewsOff(false)}
        onYes={async () => { f.set('marketing')(false); setAskNewsOff(false) }} />
      <fieldset className="acct-pick">
        <legend>Your picture</legend>
        <div className={`acct-try ${newPic ? 'is-trying' : ''}`} aria-live="polite">
          <Avatar user={{ ...user, avatar: f.values.avatar }} size="lg" owned={owned} />
          <div>
            <strong>{newPic ? 'Preview' : 'Your picture now'}</strong>
            <span>{newPic ? 'This is how it will look. Save to keep it, or go back to the one you had.' : 'Pick another below to try it on.'}</span>
          </div>
        </div>
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
        {rewardPics.length > 0 && (
          <div className="acct-pick-group is-reward" role="radiogroup" aria-label="Rewards">
            <span className="acct-pick-label">Rewards <em>{rewardPics.filter((r) => hasEarned(r, prog)).length} of {rewardPics.length} unlocked</em></span>
            <div className="acct-pick-grid">
              {rewardPics.map((r) => {
                const v = `icon:${r.picture}`
                const open = hasEarned(r, prog)
                return (
                  <button key={r.id} type="button" role="radio" disabled={!open} aria-checked={f.values.avatar === v} aria-label={`${r.name || 'Picture'}${open ? '' : ` (locked: ${earnText(r)})`}`} title={open ? r.name : `${earnText(r)} to unlock it`} className={`acct-pick-one is-reward ${f.values.avatar === v ? 'on' : ''}`} onClick={() => f.set('avatar')(v)}>
                    <span className="acct-pick-pic"><img src={asset(r.picture)} alt="" loading="lazy" style={faceLook(r)} /></span>
                  </button>
                )
              })}
            </div>
            {rewardPics.some((r) => !hasEarned(r, prog)) && (
              <ul className="acct-earn">
                {[...new Set(rewardPics.filter((r) => !hasEarned(r, prog)).map(earnText))].map((t) => <li key={t}><i aria-hidden="true">🔒</i>{t} to unlock {rewardPics.filter((r) => !hasEarned(r, prog) && earnText(r) === t).length === 1 ? 'a picture' : 'more pictures'}</li>)}
              </ul>
            )}
          </div>
        )}
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
      {designs.length > 0 && (
        <fieldset className="acct-pick acct-cards">
          <legend>Your membership card</legend>
          <p>The design of your card. More designs unlock as rewards.</p>
          {/* the card as it will look, live */}
          <div className={`acct-card-preview ${newCard ? 'is-trying' : ''}`} aria-live="polite">
            <CollectorCard name={user.name || user.email.split('@')[0]} since={new Date(user.createdAt).getFullYear()} number={memberNumber(user.memberNo)} prints={prog.pieces ? `${prog.pieces} ${prog.pieces === 1 ? 'print' : 'prints'}` : 'Your collection'} points={user.points || 0} earned={user.pointsEarned || 0} design={designOf(f.values.card)} />
            <span>{newCard ? 'Preview: save to keep this design.' : 'Your card now.'}</span>
          </div>
          <div className="acct-cards-grid" role="radiogroup" aria-label="Card designs">
            {[null, ...designs].map((d) => {
              const id = d ? d.id : ''
              const open = !d || hasEarned(d, prog)
              return (
                <button key={id || 'site'} type="button" role="radio" disabled={!open} aria-checked={f.values.card === id} className={`acct-card-pick ${f.values.card === id ? 'on' : ''}`} onClick={() => f.set('card')(id)} title={open ? '' : `${earnText(d)} to unlock it`}>
                  <span className={`acct-card-mini ${d ? `is-${d.cardLook}` : ''} ${d && d.cardArt ? 'has-art' : ''}`} style={designStyle(d)} aria-hidden="true"><b>J</b><i /></span>
                  <span className="acct-card-name">{d ? d.name : 'Night purple'}</span>
                  <small>{open ? (f.values.card === id ? 'Your card' : 'Unlocked') : <>🔒 {earnText(d)}</>}</small>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
      <Problem text={f.problem.text} />
      <div className="acc-row"><Submit busy={f.busy}>Save</Submit>{saved && <span className="acc-saved" role="status">Saved</span>}</div>
      {/* chosen but not saved: a bar at the bottom of the screen, to keep it or go back */}
      <AnimatePresence>
        {trying && (
          <motion.div className="acct-keep" role="region" aria-label="Keep your new look?" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.3, ease: EASE }}>
            <Avatar user={{ ...user, avatar: f.values.avatar }} size="md" owned={owned} />
            <span><b>Keep your new {newPic ? (newCard ? 'picture and card' : 'picture') : 'card'}?</b> It is only a preview until you save.</span>
            <button type="button" className="btn ghost sm" onClick={undo} disabled={f.busy}>Go back</button>
            <button type="button" className="btn sm" onClick={(e) => submit(e)} disabled={f.busy}>{f.busy ? 'Saving…' : 'Save'}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}

function Security() {
  const { call, user } = useAccount()
  const navigate = useNavigate()
  const pw = useForm({ current: '', password: '' })
  const [changed, setChanged] = useState(false)
  const del = useForm({ password: '', again: '' })
  const [deleting, setDeleting] = useState(false)
  const [askAll, setAskAll] = useState(false)
  // the questions before it happens: the form checks first, then the window asks
  const [askChange, setAskChange] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const quiet = { preventDefault() {} } // the form's work, run from the window once it is answered
  const askFirst = (form, test, open) => (e) => {
    e.preventDefault()
    try { test(); form.setProblem({ field: '', text: '' }); open(true) } catch (err) { form.setProblem({ field: err.field || '', text: err.message }) }
  }
  const need = (v, field, text) => { if (!String(v || '').length) { const p = new Error(text); p.field = field; throw p } }
  return (
    <div className="acc-stack">
      <form className="acc-card" onSubmit={askFirst(pw, () => {
        need(pw.values.current, 'current', 'Type your current password.')
        need(pw.values.password, 'password', 'Type the new password.')
        if (pw.values.password === pw.values.current) { const p = new Error('That is your current password. Choose a new one.'); p.field = 'password'; throw p }
      }, setAskChange)} noValidate>
        <h3 className="acc-h3">Change the password</h3>
        <div className="acc-grid">
          <Field label="Current password" type="password" autoComplete="current-password" value={pw.values.current} onChange={pw.set('current')} error={errorFor(pw.problem, 'current')} />
          <Field label="New password" type="password" autoComplete="new-password" value={pw.values.password} onChange={pw.set('password')} error={errorFor(pw.problem, 'password')} hint="At least 8 characters." />
        </div>
        <Problem text={pw.problem.field ? '' : pw.problem.text} />
        <div className="acc-row"><Submit busy={pw.busy}>Change it</Submit>{changed && <span className="acc-saved" role="status">Changed. Any other device was logged out, and an email is on its way.</span>}</div>
        <Confirm open={askChange} title="Change your password?" text="The new password works from now on. Every other device is logged out, and an email tells you it was changed." yes="Change it" no="Not now" busyText="Changing…" icon="key"
          onClose={() => setAskChange(false)}
          onYes={async () => { setAskChange(false); setChanged(false); await pw.run(quiet, async () => { await call('password', pw.values); setChanged(true); pw.set('current')(''); pw.set('password')('') }) }} />
      </form>
      <div className="acc-card">
        <h3 className="acc-h3">Log out everywhere</h3>
        <p className="acc-p">Lost a phone, or logged in on a shared computer? This logs out every device, this one too.</p>
        <button type="button" className="btn ghost sm acc-out-all" onClick={() => setAskAll(true)}>Log out of every device</button>
        <Confirm open={askAll} title="Log out everywhere?" text="Every phone, tablet and computer logged in to this account is logged out, this one too. You can log back in with your password." yes="Log out everywhere" onYes={async () => { await call('everywhere').catch(() => {}); setAskAll(false); navigate('/account/login', { replace: true }) }} onClose={() => setAskAll(false)} />
      </div>
      <div className="acc-card is-danger">
        <h3 className="acc-h3">Delete the account</h3>
        <p className="acc-p">Your login, details, points, rewards and saved cart go for good. The shop keeps its record of past sales (as the law requires), no longer linked to you.</p>
        {user && user.locked ? (
          <p className="acc-p acc-locked">This account is protected: it cannot be deleted.</p>
        ) : !deleting ? (
          <button type="button" className="btn ghost sm acc-danger" onClick={() => setDeleting(true)}>Delete my account</button>
        ) : (
          <form onSubmit={askFirst(del, () => {
            need(del.values.password, 'password', 'Type your password.')
            need(del.values.again, 'again', 'Type your password a second time.')
            if (del.values.password !== del.values.again) { const p = new Error('The two passwords are not the same.'); p.field = 'again'; throw p }
          }, setAskDelete)} noValidate>
            <Field label="Your password" type="password" autoComplete="current-password" value={del.values.password} onChange={del.set('password')} error={errorFor(del.problem, 'password')} />
            <Field label="Your password again" type="password" autoComplete="current-password" value={del.values.again} onChange={del.set('again')} error={errorFor(del.problem, 'again')} />
            <Confirm open={askDelete} title="Delete your account for good?" text="Your login, details, points, rewards and saved prints go, and this cannot be undone. The shop keeps its record of past sales, no longer linked to you." yes="Delete my account" no="Keep it" busyText="Deleting…" icon="bin" danger
              onClose={() => setAskDelete(false)}
              onYes={async () => { setAskDelete(false); await del.run(quiet, async () => { await call('delete', { password: del.values.password, again: del.values.again }); navigate('/', { replace: true }) }) }} />
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

/* News emails, asked once on the Overview: for someone who did not tick "Email me about new prints"
   when they signed up (and has not unsubscribed since). Yes turns news on; No thanks is remembered,
   so it is not asked again on any device. The box under Details changes it either way. */
function NewsAsk() {
  const { user, call } = useAccount()
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')
  const [problem, setProblem] = useState('')
  if (done) return <p className="acc-welcome acct-news-done" role="status">{done}</p>
  if (!user || user.marketing || user.newsAsked) return null
  const answer = async (on) => {
    setBusy(on ? 'yes' : 'no'); setProblem('')
    try {
      await call('news', { on })
      setDone(on ? 'You are on the list. News about new prints, conventions and the odd discount will come to ' + user.email + '. Change it any time under Details.' : 'No problem: no news emails. You can turn them on any time under Details.')
    } catch (e) { setProblem(e.message) }
    setBusy('')
  }
  const artist = String(brand.artist || brand.name || '').trim().split(/\s+/)[0]
  return (
    <section className="acct-news" aria-labelledby="acct-news-title">
      <span className="acct-news-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6h18v12H3z M3 7l9 6 9-6" /></svg></span>
      <div className="acct-news-words">
        <h2 id="acct-news-title">Want news from {artist}?</h2>
        <p>New prints, conventions, commissions opening and the odd discount, straight to your inbox. No spam, and you can stop any time.</p>
        {problem && <p className="acc-reply-bad" role="alert">{problem}</p>}
      </div>
      <div className="acct-news-go">
        <button type="button" className="btn sm" onClick={() => answer(true)} disabled={Boolean(busy)}>{busy === 'yes' ? 'One moment…' : `Yes, keep me posted${accountPage.points.on && accountPage.points.news > 0 ? ` (+${accountPage.points.news} ${accountPage.points.name})` : ''}`}</button>
        <button type="button" className="btn ghost sm" onClick={() => answer(false)} disabled={Boolean(busy)}>{busy === 'no' ? 'One moment…' : 'No thanks'}</button>
      </div>
    </section>
  )
}

/* the first thing a customer sees: hello, how things stand, their prints, what is new */
function Overview({ orders, go, commissions = null, openCommissions = () => {} }) {
  const { user } = useAccount()
  const shopOrders = keptOrders(orders)
  const collected = printsIn(orders)
  // the pieces they own, once each, newest first
  const owned = ownedIn(orders)
  const saved = (user.saved || []).map((slug) => work.find((p) => p.slug === slug)).filter(Boolean)
  const latest = (orders || []).find((o) => o.kind !== 'support') // the newest, refunded or not
  return (
    <div className="acct-overview">
      <div className="acct-top">
        <CollectorCard
          name={user.name || user.email.split('@')[0]}
          since={new Date(user.createdAt).getFullYear()}
          number={memberNumber(user.memberNo)}
          prints={orders ? `${collected} ${collected === 1 ? 'print' : 'prints'}` : '…'}
          points={user.points || 0}
          earned={user.pointsEarned || 0}
          design={designOf(user.card)}
        />
      <div className="acct-stats is-stacked">
        <button type="button" onClick={() => go('orders')}><strong>{orders ? shopOrders.length : '–'}</strong><span>{shopOrders.length === 1 ? 'Order' : 'Orders'}</span></button>
        <button type="button" onClick={() => go('orders')}><strong>{orders ? collected : '–'}</strong><span>{collected === 1 ? 'Print collected' : 'Prints collected'}</span></button>
        <button type="button" onClick={() => go('saved')}><strong>{saved.length}</strong><span>Saved for later</span></button>
        {accountPage.points.on && <button type="button" onClick={() => go('rewards')}><strong>{user.points || 0}</strong><span>{accountPage.points.name[0].toUpperCase() + accountPage.points.name.slice(1)}</span></button>}
      </div>
      </div>

      <NewsAsk />

      {commissions && commissions.unread > 0 && (
        <button type="button" className="acc-cnotice" onClick={openCommissions}>
          <b>{commissions.unread}</b>
          <span><strong>{commissions.unread === 1 ? 'A new message' : 'New messages'} about your commission</strong><small>Read and answer under Orders → Commissions</small></span>
          <i aria-hidden="true">→</i>
        </button>
      )}

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

/* The rewards: every one the shop offers, each with how it is earned and how close they are, the
   ones they have open, and the codes of the discounts they have earned. */
const untilDay = (t) => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDay = (t) => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
function Rewards({ go, fresh = [] }) {
  const { call } = useAccount()
  const cart = useCart()
  const [adding, setAdding] = useState('')
  const [data, setData] = useState(null)
  const [problem, setProblem] = useState('')
  const [copied, setCopied] = useState('')
  const [shelfOpen, setShelfOpen] = useState(false) // the archived gifts, folded away
  const [dropping, setDropping] = useState([]) // archived gifts waiting for a yes before they are deleted
  const stopDropping = useCallback(() => setDropping([]), [])
  // on a phone the tab is in three parts, one shown at a time: points, gifts, rewards
  const phone = useMedia('(max-width: 699px)')
  const [part, setPart] = useState('')
  const [tick, setTick] = useState(0) // asked again after points are spent
  const [redeeming, setRedeeming] = useState('')
  const [redeemSaid, setRedeemSaid] = useState('')
  const redeem = async (id) => {
    setRedeeming(id); setRedeemSaid('')
    try {
      const r = await call('redeem', { id })
      const c = r.claim || {}
      const artist = String(brand.artist || brand.name || '').trim().split(' ')[0]
      setRedeemSaid(c.kind === 'discount' ? (c.code ? `Done: your code ${c.code.code} is below, and in your email.` : 'Done: your code is being made and shows below in a moment.') : `Done: ${artist} has been told about your ${c.name} and will be in touch.`)
      setTick((t) => t + 1)
    } catch (e) { setRedeemSaid(e.message) } finally { setRedeeming('') }
  }
  const toCart = async (code) => {
    setAdding(code)
    const r = await cart.applyCode(code)
    setAdding('')
    if (r.ok) cart.setOpen(true); else setCopied(`!${r.message}`)
  }
  useEffect(() => {
    let stale = false
    let later = null
    const ask = (again) => call('rewards').then((s) => {
      if (stale) return
      setData(s)
      // a discount earned whose code was still being made: look again in a moment, once
      if (again && s.rewards.some((r) => r.earned && r.kind === 'discount' && !r.code)) later = setTimeout(() => ask(false), 2500)
    }).catch((e) => { if (!stale) setProblem(e.message) })
    ask(true)
    return () => { stale = true; clearTimeout(later) }
  }, [call, tick])
  if (problem) return <p className="acc-problem">{problem}</p>
  if (!data) return <p className="acc-wait">Fetching your rewards…</p>
  const p = data.progress
  const local = Object.fromEntries(accountPage.rewards.map((r) => [r.id, r]))
  const list = data.rewards.map((r) => ({ ...local[r.id], ...r }))
  const giftCodes = data.giftCodes || []
  const gifted = list.filter((r) => r.gifted)
  const earnable = list.filter((r) => !r.gifted)
  const pointsOn = Boolean(data.points && data.points.on)
  if (!list.length && !giftCodes.length && !pointsOn) return <div className="acc-empty"><strong>No rewards yet</strong><p>Rewards for members are on their way.</p></div>
  const have = (r) => (r.earnedBy === 'orders' ? p.orders : r.earnedBy === 'pieces' ? p.pieces : r.earnedBy === 'commissions' ? p.commissions || 0 : p.verified ? 1 : 0)
  const need = (r) => (r.earnedBy === 'verify' ? 1 : r.count)
  const unit = (r) => (r.earnedBy === 'pieces' ? 'prints' : r.earnedBy === 'commissions' ? 'commissions' : 'orders')
  const copy = async (code) => { try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 1600) } catch { /* the code is on screen to copy by hand */ } }

  // a code: the chip with its copy icon and "Add to my cart", or crossed out once it no longer works
  const codeBox = (code, state, usedAt) => (state !== 'ready' ? (
    <div className="acct-code is-used">
      <code>{code}</code>
      <small>{state === 'used' ? (usedAt ? `Used on ${untilDay(usedAt)}. Thank you!` : 'Used. Thank you!') : 'This code has ended.'}</small>
    </div>
  ) : (
    <div className="acct-code">
      <span className="acct-code-row">
        <code>{code}</code>
        <button type="button" className={`acct-code-copy ${copied === code ? 'is-done' : ''}`} onClick={() => copy(code)} aria-label={copied === code ? 'Copied' : 'Copy the code'} title={copied === code ? 'Copied' : 'Copy the code'}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={copied === code ? 'M5 12.5l4.500 4.500L19 7' : 'M9 9h10v11H9z M5 15V4h10'} /></svg>
        </button>
      </span>
      <button type="button" className="acc-link acct-code-add" onClick={() => toCart(code)} disabled={adding === code}>{adding === code ? 'Adding…' : 'Add to my cart →'}</button>
      {copied.startsWith('!') && <small className="acct-code-problem">{copied.slice(1)}</small>}
    </div>
  ))

  // a reward (from Shop → Rewards): earned by its rule, or gifted
  const rewardCard = (r, tools = null) => {
    const pct = Math.min(100, Math.round((Math.min(have(r), need(r)) / need(r)) * 100))
    return (
      <article key={r.id} className={`acct-reward ${r.earned ? 'is-earned' : ''} is-${r.kind} ${fresh.includes(r.id) ? 'is-new' : ''}`}>
        {fresh.includes(r.id) && <span className="acct-reward-new">New</span>}
        {tools}
        <div className="acct-reward-art" aria-hidden="true">
          {r.kind === 'picture' && r.picture && <span className="acct-pick-pic"><img src={asset(r.picture)} alt="" loading="lazy" style={faceLook(r)} /></span>}
          {r.kind === 'card' && <span className={`acct-card-mini is-${r.cardLook} ${r.cardArt ? 'has-art' : ''}`} style={designStyle(r)}><b>J</b><i /></span>}
          {r.kind === 'discount' && <span className="acct-reward-off"><b>{r.percent}%</b><small>off</small></span>}
        </div>
        <div className="acct-reward-body">
          <span className="acct-reward-kind">{r.kind === 'picture' ? 'Profile picture' : r.kind === 'card' ? 'Card design' : 'Discount'}</span>
          <strong>{r.name}</strong>
          <span className="acct-reward-how">{r.gifted ? `A gift from ${brand.name}` : r.earned ? 'Unlocked' : `${earnText(r)} to unlock it`}{r.earned && r.code && r.code.code && !r.code.usedAt ? ` · until ${shortDay(r.code.until)}` : ''}</span>
          {!r.earned && r.earnedBy !== 'verify' && (
            <div className="acct-meter" role="progressbar" aria-valuemin={0} aria-valuemax={need(r)} aria-valuenow={Math.min(have(r), need(r))} aria-label={`${Math.min(have(r), need(r))} of ${need(r)}`}>
              <i style={{ width: `${pct}%` }} /><small>{Math.min(have(r), need(r))} / {need(r)} {unit(r)}</small>
            </div>
          )}
          {r.earned && r.kind === 'discount' && (r.code ? codeBox(r.code.code, r.code.usedAt ? 'used' : 'ready', r.code.usedAt) : <small className="acct-reward-wait">Your code is being made. Look again in a moment.</small>)}
          {r.earned && r.kind !== 'discount' && <button type="button" className="acc-link" onClick={() => go('details')}>{r.kind === 'picture' ? 'Use it as your picture' : 'Use it on your card'} →</button>}
        </div>
      </article>
    )
  }

  // a discount code the admin gave them
  const codeCard = (g, tools = null) => (
    <article key={g.id} className={`acct-reward is-discount ${g.state === 'ready' ? 'is-earned' : 'is-spent'} ${fresh.includes(`code:${g.id}`) ? 'is-new' : ''}`}>
      {fresh.includes(`code:${g.id}`) && <span className="acct-reward-new">New</span>}
      {tools}
      <div className="acct-reward-art" aria-hidden="true"><span className="acct-reward-off"><b>{g.percent}%</b><small>off</small></span></div>
      <div className="acct-reward-body">
        <span className="acct-reward-kind">Discount code</span>
        <strong>{g.percent}% off</strong>
        <span className="acct-reward-how">{g.state === 'ready' ? `A gift from ${brand.name}${g.until ? ` · until ${shortDay(g.until)}` : ''}` : g.state === 'used' ? 'Used' : 'Ended'}</span>
        {codeBox(g.code, g.state, g.usedAt)}
      </div>
    </article>
  )

  /* Gifts can be put away: archived ones fold into a list below (and can come back), deleted ones
     are gone from view. A gifted picture or card design stays theirs either way. */
  const shelf = (id, to) => {
    const ids = [].concat(id)
    setData((d) => {
      const archived = (d.archived || []).filter((x) => !ids.includes(x)), deleted = (d.deleted || []).filter((x) => !ids.includes(x))
      if (to === 'archive') archived.push(...ids); if (to === 'delete') deleted.push(...ids)
      return { ...d, archived, deleted }
    })
    call('giftShelf', { ids, to }).catch(() => {})
  }
  const archived = data.archived || [], deleted = data.deleted || []
  const gifts = [
    ...giftCodes.map((g) => ({ key: `code:${g.id}`, name: `${g.percent}% off`, note: g.state === 'ready' ? 'Discount code, still works' : g.state === 'used' ? 'Discount code, used' : 'Discount code, ended', works: g.state === 'ready', card: (tools) => codeCard(g, tools) })),
    ...gifted.map((r) => ({ key: r.id, name: r.name, note: r.kind === 'picture' ? 'Profile picture (still yours)' : r.kind === 'card' ? 'Card design (still yours)' : 'Discount', works: true, card: (tools) => rewardCard(r, tools) })),
  ].filter((x) => !deleted.includes(x.key))
  const shown = gifts.filter((x) => !archived.includes(x.key))
  const putAway = gifts.filter((x) => archived.includes(x.key))
  const [openShelf, setOpenShelf] = [shelfOpen, setShelfOpen]
  const archiveBtn = (x) => (
    <button type="button" className="acct-gift-archive" onClick={() => shelf(x.key, 'archive')} aria-label={`Archive ${x.name}`} title="Archive">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v4H3z M5 9v10h14V9 M10 13h4" /></svg>
    </button>
  )
  const giftCount = shown.length
  // the parts there are, each with its count; the one open (the one chosen, else gifts when something is new, else points)
  const unlocked = earnable.filter((r) => r.earned).length
  const parts = [
    pointsOn && { key: 'points', label: data.points.name[0].toUpperCase() + data.points.name.slice(1), count: String(data.points.balance) },
    (giftCount > 0 || putAway.length > 0) && { key: 'gifts', label: 'Gifts', count: String(giftCount), dot: shown.some((x) => fresh.includes(x.key)) },
    earnable.length > 0 && { key: 'rewards', label: 'Rewards', count: `${unlocked}/${earnable.length}` },
  ].filter(Boolean)
  const open = parts.some((x) => x.key === part) ? part : (parts.find((x) => x.key === 'gifts' && x.dot) || parts[0] || {}).key
  const showing = (k) => !phone || parts.length < 2 || open === k
  return (
    <div className={`acct-rewards ${phone && parts.length > 1 ? 'is-parted' : ''}`}>
      {phone && parts.length > 1 && (
        <nav className="acct-parts" role="tablist" aria-label="Rewards">
          {parts.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={open === x.key} className={open === x.key ? 'on' : ''} onClick={() => { setPart(x.key); window.scrollTo({ top: Math.min(window.scrollY, (document.querySelector('.acct-rewards')?.getBoundingClientRect().top || 0) + window.scrollY - 120), behavior: 'smooth' }) }}>
              <span>{x.label}</span><b>{x.count}</b>{x.dot && <i aria-label="new" />}
            </button>
          ))}
        </nav>
      )}
      {showing('rewards') && <div className="acct-progress">
        <span><b>{p.orders}</b> {p.orders === 1 ? 'order' : 'orders'}</span>
        <span><b>{p.pieces}</b> {p.pieces === 1 ? 'print' : 'prints'}</span>
        {(p.commissions || 0) > 0 && <span><b>{p.commissions}</b> {p.commissions === 1 ? 'commission' : 'commissions'}</span>}
        <span><b>{p.verified ? '✓' : '–'}</b> email {p.verified ? 'confirmed' : 'not confirmed'}</span>
        {giftCount > 0 && <span><b>{giftCount}</b> {giftCount === 1 ? 'gift' : 'gifts'}</span>}
      </div>}
      {pointsOn && showing('points') && <PointsPanel points={data.points} onRedeem={redeem} busy={redeeming} said={redeemSaid} onRefresh={() => setTick((t) => t + 1)} />}
      {giftCount > 0 && showing('gifts') && (
        <section className="acct-reward-group">
          <header className="acct-group-head">
            <h3>Gifts</h3>
            <p>Given to you by {brand.name}.</p>
          </header>
          <div className="acct-reward-list">{shown.map((x) => x.card(archiveBtn(x)))}</div>
        </section>
      )}
      {putAway.length > 0 && showing('gifts') && (
        <div className="acct-shelf">
          <button type="button" className="acct-shelf-toggle" aria-expanded={openShelf} onClick={() => setOpenShelf(!openShelf)}>
            Archived <small>{putAway.length}</small>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {openShelf && putAway.length > 1 && <button type="button" className="acc-link is-danger acct-shelf-all" onClick={() => setDropping(putAway)}>Delete all</button>}
          {openShelf && (
            <ul className="acct-shelf-list">
              {putAway.map((x) => (
                <li key={x.key}>
                  <span><b>{x.name}</b><small>{x.note}</small></span>
                  <button type="button" className="acc-link" onClick={() => shelf(x.key, 'restore')}>Restore</button>
                  <button type="button" className="acc-link is-danger" onClick={() => setDropping([x])}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <DeleteGifts items={dropping} onClose={stopDropping} onYes={(list) => shelf(list.map((x) => x.key), 'delete')} />
      {earnable.length > 0 && showing('rewards') && (
        <section className="acct-reward-group">
          <header className="acct-group-head">
            <h3>Rewards</h3>
            <p>Earned by confirming your email, by your orders and the prints you collect. <b>{earnable.filter((r) => r.earned).length}/{earnable.length}</b> unlocked.</p>
          </header>
          <div className="acct-reward-list">{earnable.map((r) => rewardCard(r))}</div>
        </section>
      )}
    </div>
  )
}
/* Points, at the top of Rewards: the balance, how far to the next reward on the road, the road itself
   (Redeem once the balance covers it), the ways to earn more, what was redeemed, and the history. The
   rules and the road are the admin's (Rewards → Points); the numbers come with the rewards (api/_points.js). */
const newsBonusLine = (how = '') => (accountPage.points && accountPage.points.on && accountPage.points.news > 0 ? <b className="acc-bonus"> +{accountPage.points.news} {accountPage.points.name}{how}</b> : null)
function PointsPanel({ points, onRedeem, busy, said, onRefresh = () => {} }) {
  const { call, user } = useAccount()
  const { balance, rewards, claims, log, name, intro, perUnit, signup, news, newsBonus, field = 0, fields = [] } = points
  const Name = name[0].toUpperCase() + name.slice(1)
  const one = name.replace(/s$/, '')
  const artist = String(brand.artist || brand.name || '').trim().split(' ')[0]
  // the balance counts up when the panel appears (straight to it for those who prefer less motion)
  const [shown, setShown] = useState(balance)
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(balance); setGrown(true); return undefined }
    let raf = 0
    const start = performance.now(), took = 900
    const step = (t) => { const k = Math.min(1, (t - start) / took); setShown(Math.round(balance * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    const g = setTimeout(() => setGrown(true), 60)
    return () => { cancelAnimationFrame(raf); clearTimeout(g) }
  }, [balance])
  // the road: each reward a checkpoint, evenly spaced; "you" between the last one reached and the next
  const next = rewards.find((r) => r.cost > balance) || null
  const at = (() => {
    if (!rewards.length) return 0
    const i = rewards.findIndex((r) => r.cost > balance)
    if (i === -1) return 100
    const prev = i ? rewards[i - 1].cost : 0
    return ((i + (balance - prev) / (rewards[i].cost - prev)) / rewards.length) * 100
  })()
  const [pick, setPick] = useState(() => (next || rewards[rewards.length - 1] || {}).id)
  const chosen = rewards.find((r) => r.id === pick) || next || rewards[0]
  const left = chosen ? Math.max(0, chosen.cost - balance) : 0
  const spend = perUnit > 0 ? Math.ceil(left / perUnit) : 0
  // the ways to earn, each one done or one tap away
  const [doing, setDoing] = useState('')
  const [copied, setCopied] = useState('')
  const [sent, setSent] = useState('')
  const act = async (what, work) => { setDoing(what); try { await work(); onRefresh() } catch { /* the chip stays as it was */ } finally { setDoing('') } }
  const copy = async (code) => { try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 1500) } catch { /* the code is on screen */ } }
  const ways = [
    perUnit > 0 && { key: 'order', pts: perUnit === 1 ? `1 ${one}` : `${perUnit} ${name}`, text: `for every ${money(1, true)} you spend`, done: false, to: '/shop', go: 'Shop' },
    signup > 0 && { key: 'email', pts: `+${signup}`, text: 'confirm your email', done: Boolean(user && user.verified), run: async () => { const r = await call('resend'); if (r && r.mailed === false) throw new Error('not sent') }, go: 'Send the link', after: 'Link sent' },
    field > 0 && { key: 'detail', pts: `+${field}`, text: `each detail on your account${fields.length ? ` (${fields.map((k) => (k === 'phone' ? 'phone number' : 'name')).join(', ')} to add)` : ''}`, done: !fields.length, to: '/account?tab=details', go: 'Add it' },
    news > 0 && newsBonus !== 'taken' && { key: 'news', pts: `+${news}`, text: 'say yes to news', done: newsBonus === 'given', wait: user && user.marketing && !user.verified ? 'Yes ✓ · the points come when your email is confirmed' : '', run: () => call('news', { on: true }), go: 'Yes, email me' },
  ].filter(Boolean)
  const WHY = { order: 'Order', commission: 'Commission', signup: 'Email confirmed', detail: 'Detail added', news: 'Said yes to news', 'news-off': 'Unsubscribed from news', refund: 'Refunded', redeem: 'Spent on', admin: `From ${artist}` }
  const day = (t) => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const [more, setMore] = useState(false)
  return (
    <section className="pts" aria-labelledby="pts-title">
      <div className="pts-head">
        <div className="pts-burst" aria-live="polite"><b>{shown}</b><small>{name}</small></div>
        <div className="pts-head-words">
          <h3 id="pts-title">{Name}</h3>
          <p>{intro || `Every order earns ${name}. Spend them on the rewards below.`}</p>
          {next
            ? <p className="pts-next"><b>{next.cost - balance}</b> more to <b>{next.name}</b></p>
            : rewards.length ? <p className="pts-next is-all">Every reward on the road is yours to take.</p> : null}
        </div>
      </div>

      {rewards.length > 0 && (
        <>
          {/* the road: the line fills up to "you", each checkpoint a reward to look at */}
          <div className="pts-road" style={{ '--n': rewards.length }}>
            <div className="pts-line"><i style={{ width: `${grown ? at : 0}%` }} /></div>
            <span className="pts-you" style={{ left: `${grown ? at : 0}%` }} aria-hidden="true"><b>You</b></span>
            <span className="pts-start" aria-hidden="true">0</span>
            <ol className="pts-stops" aria-label="Rewards on the way">
              {rewards.map((r, i) => (
                <li key={r.id} style={{ left: `${((i + 1) / rewards.length) * 100}%` }}>
                  <button type="button" className={`pts-stop ${r.can ? 'is-reached' : ''} ${chosen && chosen.id === r.id ? 'is-on' : ''}`} onClick={() => setPick(r.id)} aria-pressed={Boolean(chosen && chosen.id === r.id)} aria-label={`${r.name}: ${r.cost} ${name}${r.can ? ', yours to take' : `, ${r.cost - balance} more`}`}>
                    <span className="pts-stop-dot">{r.can ? '★' : r.kind === 'discount' ? '%' : '🎁'}</span>
                    <span className="pts-stop-cost">{r.cost}</span>
                    <span className="pts-stop-name">{r.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {/* the checkpoint looked at: what it is, and Redeem or how far */}
          {chosen && (
            <div className={`pts-pick ${chosen.can ? 'is-open' : ''}`} key={chosen.id}>
              <div className="pts-pick-tag">{chosen.kind === 'discount' ? `${chosen.percent}% off` : 'A gift'}</div>
              <div className="pts-pick-words">
                <h4>{chosen.name}</h4>
                {chosen.text && <p>{chosen.text}</p>}
                <small>{chosen.cost} {name}{chosen.kind === 'discount' ? ` · a code good for ${chosen.days} days` : ` · ${artist} arranges it with you`}</small>
              </div>
              <div className="pts-pick-do">
                {chosen.can
                  ? <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => onRedeem(chosen.id)}>{busy === chosen.id ? 'One moment…' : `Redeem for ${chosen.cost}`}</button>
                  : (
                    <>
                      <div className="pts-gap"><b>{left}</b> {name} to go</div>
                      {spend > 0 && <small>about {money(spend, true)} of orders</small>}
                      <Link className="btn ghost sm" to="/shop">Find a print <span className="arrow">→</span></Link>
                    </>
                  )}
              </div>
            </div>
          )}
        </>
      )}
      {said && <p className="acc-welcome" role="status">{said}</p>}

      {/* the ways to earn: done, or one tap away */}
      {ways.length > 0 && (
        <div className="pts-ways">
          <h4>Earn more</h4>
          <ul>
            {ways.map((w) => (
              <li key={w.key} className={w.done ? 'is-done' : ''}>
                <span className="pts-way-pts">{w.pts}</span>
                <span className="pts-way-text">{w.text}</span>
                {w.done ? <span className="pts-way-done" aria-label="Done">✓</span>
                  : w.wait ? <span className="pts-way-wait">{w.wait}</span>
                  : w.to ? <Link className="pts-way-go" to={w.to}>{w.go} →</Link>
                    : <button type="button" className="pts-way-go" disabled={doing === w.key || sent === w.key} onClick={() => act(w.key, async () => { await w.run(); if (w.after) setSent(w.key) })}>{doing === w.key ? '…' : sent === w.key ? w.after : `${w.go} →`}</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {claims.length > 0 && (
        <div className="pts-tickets">
          <h4>Yours</h4>
          <ul>{claims.map((c) => (
            <li key={c.id} className={`pts-ticket ${c.kind === 'discount' ? 'is-code' : ''}`}>
              <span className="pts-ticket-cost">−{c.cost}</span>
              <span className="pts-ticket-words"><b>{c.name}</b><small>{day(c.at)}</small></span>
              {c.kind === 'discount'
                ? (c.code ? <button type="button" className="pts-ticket-code" onClick={() => copy(c.code.code)} title="Copy the code">{copied === c.code.code ? 'Copied ✓' : c.code.code}</button> : <small>code on its way</small>)
                : <span className={`pts-ticket-state ${c.status === 'sent' ? 'is-sent' : ''}`}>{c.status === 'sent' ? 'Sent' : `${artist} will be in touch`}</span>}
            </li>
          ))}</ul>
        </div>
      )}

      {log.length > 0 && (
        <div className="pts-log">
          <button type="button" className="acc-link" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Hide the history' : 'See the history'}</button>
          {more && <ul>{log.map((x, i) => <li key={i}><span>{day(x.at)}</span><span>{WHY[x.why] || x.why}{x.ref ? ` · ${x.ref}` : ''}</span><b className={x.delta < 0 ? 'is-minus' : ''}>{x.delta > 0 ? '+' : ''}{x.delta}</b></li>)}</ul>}
        </div>
      )}
    </section>
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

const TABS = [['overview', 'Overview'], ['orders', 'Orders'], ['rewards', 'Rewards'], ['saved', 'Saved'], ['details', 'Details'], ['security', 'Security']]
const TAB_ICONS = {
  rewards: 'M4 9h16v4H4z M5 13h14v8H5z M12 9v12 M12 9c-2-4-6-4-6-1.500S9 9 12 9z M12 9c2-4 6-4 6-1.500S15 9 12 9z',
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
  const paid = params.get('thanks') === '1'
  const { orders, problem, drop } = useOrders(paid)
  // their commissions (components/AccountCommissions.jsx): the Orders tab counts new messages
  const commissions = useCommissionList(Boolean(user))
  // Commissions in the account can be switched off (Show / hide → Commissions): still shown to anyone who has one
  const comShown = shows('commissions', 'account') || Boolean(commissions.list && commissions.list.length)
  const view = comShown && tab === 'orders' && params.get('view') === 'commissions' ? 'commissions' : 'shop'
  // back from paying: what was bought leaves the cart
  const { settle } = useCart()
  useEffect(() => { if (paid) settle() }, [paid, settle])
  const [leaving, setLeaving] = useState(false) // the 'log out?' window
  const [preview, setPreview] = useState(null) // a picture or card being tried on under Details, not saved yet
  // gifts from the admin they have not seen yet: a banner here, and "New" on them under Rewards. Once
  // they open Rewards (or close the banner) they are seen; this visit still marks them new there.
  const [freshGifts, setFreshGifts] = useState([])
  const newGifts = user ? user.newGifts || [] : []
  useEffect(() => { if (newGifts.length) setFreshGifts((f) => [...new Set([...f, ...newGifts])]) }, [newGifts.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  // a gift is a reward from Shop → Rewards, or a discount code ("code:<id>") from the Discounts screen
  const giftOf = (id) => {
    if (!id.startsWith('code:')) return accountPage.rewards.find((r) => r.id === id) || null
    const g = (user ? user.giftCodes || [] : []).find((x) => `code:${x.id}` === id)
    return g ? { id, kind: 'discount', name: `${g.percent}% off`, percent: g.percent, code: true } : null
  }
  const [popClosed, setPopClosed] = useState(false) // the gift window, closed for this visit
  const popGifts = popClosed ? [] : freshGifts.map(giftOf).filter(Boolean)
  // opening Rewards is seeing them (the window and the "New" marks stay for this visit)
  useEffect(() => { if (tab === 'rewards' && newGifts.length) call('seenGifts').catch(() => {}) }, [tab, newGifts.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const owned = ownedIn(orders)
  const grid = useRef(null)
  // where the row of sections scrolls sideways (a phone), the open one slides into view; only the row moves, never the page
  useEffect(() => {
    const row = grid.current
    const on = row && row.querySelector('button.on')
    if (!on || row.scrollWidth <= row.clientWidth) return
    row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [tab, Boolean(user)]) // eslint-disable-line react-hooks/exhaustive-deps
  // the browser tab's title follows the section, without the page's own scroll-to-top on a new title
  useEffect(() => { const name = TABS.find(([k]) => k === tab)[1]; document.title = `${tab === 'overview' ? 'Your account' : name} — ${brand.name}` }, [tab])
  if (!user) return <Navigate to={`/account/login?next=${encodeURIComponent(`/account${params.toString() ? `?${params}` : ''}`)}`} replace />
  const first = (user.name || '').split(' ')[0]
  const confirmed = params.get('confirmed')
  const note = paid ? `${shop.thanksTitle} ${shop.thanksText}` : confirmed ? `Your email is confirmed. Every order placed with it now shows here.${confirmed === 'reward' ? ' You unlocked rewards: see them under Rewards, and pick your picture and card under Details.' : ''}` : params.get('welcome') ? `Welcome${first ? `, ${first}` : ''}. Your account is ready.` : params.get('reset') ? 'Your new password is saved, and you are logged in.' : ''
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
  const counts = { orders: shopOrders.length, saved: (user.saved || []).length, rewards: newGifts.length }
  const prints = printsIn(orders)
  // the banner: a strip of panels. Their own art first (the print they picked as their picture,
  // the prints they own, the ones they saved), then the newest work, so it is never empty
  const chosen = user.avatar && !user.avatar.startsWith('icon:') ? work.find((p) => p.slug === user.avatar) : null
  const savedPieces = (user.saved || []).map((slug) => work.find((p) => p.slug === slug))
  const strip = [...new Map([chosen, ...owned, ...savedPieces, ...work].filter((p) => p && p.src).map((p) => [p.slug, p])).values()].slice(0, 12)
  const LEADS = {
    orders: view === 'commissions' ? `The pieces drawn for you: the conversation with ${String(brand.artist || brand.name).split(' ')[0]}, the quote, and each stage of the work.` : 'Every print you have ordered, and where it is now.',
    rewards: 'What you have earned, and how close you are to the next one.',
    saved: 'The pieces you are keeping an eye on.',
    details: 'Your name, how to reach you, and your picture.',
    security: 'Your password, your devices, your account.',
  }
  const logout = async () => { await call('logout').catch(() => {}); setLeaving(false); navigate('/', { replace: true }) }
  return (
    <Page title="Your account">
      <GiftPopup gifts={popGifts} onClose={() => setPopClosed(true)} onSee={() => { setPopClosed(true); go('rewards') }} />
      <Confirm open={leaving} title="Log out?" text={`You can log back in any time with ${user.email}. Your cart and saved pieces stay with your account.`} yes="Log out" onYes={logout} onClose={() => setLeaving(false)} />
      <div className="container acct2">
        {/* the profile: a banner of their own art, their picture over its edge, their name */}
        <header className="acct2-hero">
          <div className="acct2-banner" aria-hidden="true">
            <div className="acct2-issue">
              <small>Member no.</small>
              <b>{memberNumber(user.memberNo)}</b>
            </div>
            {/* a carousel: the panels run past, twice over, so the loop has no seam */}
            {strip.length > 0 && (
              <div className="acct2-strip">
                <div className="acct2-track" style={{ '--n': strip.length }}>
                  {[...strip, ...strip].map((p, i) => <span key={`${p.slug}-${i}`} className="acct2-panel"><img src={asset(p.src)} alt="" loading={i < strip.length ? 'eager' : 'lazy'} /></span>)}
                </div>
              </div>
            )}
          </div>
          <div className="acct2-id">
            <Avatar user={preview ? { ...user, avatar: preview.avatar } : user} size="xl" owned={owned} />
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
              {counts[k] > 0 && <small className={k === 'rewards' ? 'is-alert' : ''} aria-label={k === 'rewards' ? `${counts[k]} new` : undefined}>{counts[k]}</small>}
              {k === 'orders' && commissions.unread > 0 && <small className="is-alert" title="New messages about your commissions" aria-label={`${commissions.unread} new ${commissions.unread === 1 ? 'message' : 'messages'} about your commissions`}>{commissions.unread}</small>}
            </button>
          ))}
        </nav>

        <div className="acct2-main">
          {note && (
            <div className="acc-welcome is-closable" role="status">
              <span>{note}</span>
              <button type="button" className="acc-welcome-x" aria-label="Dismiss" onClick={() => setParams(tab === 'overview' ? {} : { tab }, { replace: true })}>×</button>
            </div>
          )}
          {!user.verified && tab !== 'details' && (
            <div className="acc-verify" role="status">
              <span>Confirm your email: there is a link in your inbox at <b>{user.email}</b>.{accountPage.rewards.some((r) => r.earnedBy === 'verify') && <> {accountPage.rewardText}</>}</span>
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
            {tab === 'overview' && <Overview orders={orders} go={go} commissions={commissions} openCommissions={() => setParams({ tab: 'orders', view: 'commissions' }, { replace: true })} />}
            {tab === 'orders' && (
              <>
                {/* the shop's orders, and the commissions: a tab each (?view=commissions) */}
                {comShown && <div className="acc-csub" role="tablist" aria-label="Which orders">
                  <button type="button" role="tab" aria-selected={view === 'shop'} className={view === 'shop' ? 'on' : ''} onClick={() => setParams({ tab: 'orders' }, { replace: true })}>Shop orders<small>{orders ? shopOrders.length : '–'}</small></button>
                  <button type="button" role="tab" aria-selected={view === 'commissions'} className={view === 'commissions' ? 'on' : ''} onClick={() => setParams({ tab: 'orders', view: 'commissions' }, { replace: true })}>
                    Commissions<small>{commissions.list ? commissions.list.length : '–'}</small>
                    {commissions.unread > 0 && <small className="is-alert" aria-label={`${commissions.unread} new`}>{commissions.unread} new</small>}
                  </button>
                </div>}
                {view === 'commissions'
                  ? <AccountCommissions list={commissions.list} reload={commissions.reload} params={params} setParams={setParams} />
                  : <Orders orders={orders} problem={problem} onRemoved={drop} />}
              </>
            )}
            {tab === 'rewards' && <Rewards go={go} fresh={freshGifts} />}
            {tab === 'saved' && <Saved />}
            {tab === 'details' && <Details onPreview={setPreview} owned={owned} progress={orders ? { verified: Boolean(user.verified), orders: keptOrders(orders).length, pieces: printsIn(orders), commissions: (commissions.list || []).filter((c) => c.counted).length } : null} />}
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
      <Route path="unsubscribe" element={<Unsubscribe />} />
      <Route path="gift" element={<AcceptGift />} />
      <Route path="*" element={<Navigate to="/account" replace />} />
    </Routes>
  )
}
