import { useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { asset, brand, safeUrl, support } from '../data/site'
import { useFinePointer, useReducedMotion } from '../hooks/useMedia'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Lightbox from '../components/Lightbox'

/* The Support page: the artist's own project (what it is, its art) and the ways to back it.
   Money never touches this site. Each way to give is a payment link the artist made with a
   payment service (a Stripe Payment Link, Ko-fi, PayPal.me...) and pasted into the admin; the
   button here simply opens it. Until the first link is in, the page says support is on its way. */

/* A pointer position over an element, as two springs running from -1 to 1 (0 with no mouse). */
function usePointer() {
  const ref = useRef(null)
  const fine = useFinePointer(), reduced = useReducedMotion()
  const mx = useMotionValue(0), my = useMotionValue(0)
  const x = useSpring(mx, { stiffness: 80, damping: 18 }), y = useSpring(my, { stiffness: 80, damping: 18 })
  const move = (e) => {
    if (!fine || reduced || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1); my.set(((e.clientY - r.top) / r.height) * 2 - 1)
  }
  const rest = () => { mx.set(0); my.set(0) }
  return { ref, x, y, move, rest }
}

/* The top of the page is a night scene: a moon, the knight standing in front of it, and his
   shadow thrown across the ground toward the reader. The pointer is the light: move it and the
   moon drifts one way while the shadow swings the other. */
function Night() {
  const s = support
  const { ref, x, y, move, rest } = usePointer()
  const cast = useTransform(x, [-1, 1], [34, -34]) // the shadow leans away from the light
  const moonX = useTransform(x, [-1, 1], [-26, 26]), moonY = useTransform(y, [-1, 1], [-14, 14])
  const lean = useTransform(x, [-1, 1], [6, -6])
  return (
    <header ref={ref} className="night" onMouseMove={move} onMouseLeave={rest}>
      <div className="container night-inner">
        <div className="night-copy">
          {s.label && <div className="label accent">{s.label}</div>}
          <h1 className={s.logo ? 'project-logo' : 'display h-xl'}>{s.logo ? <img src={asset(s.logo)} alt={s.title} /> : s.title}</h1>
          {s.intro && <p className="lead">{s.intro}</p>}
          <div className="hero-actions">
            <Magnetic><a className="btn" href="#back">{s.primaryLabel} <span className="arrow">↓</span></a></Magnetic>
            {s.art.some((a) => a && a.src) && <Magnetic><a className="btn ghost" href="#art">See the art</a></Magnetic>}
          </div>
        </div>
        {s.figure && (
          <div className="night-stage" aria-hidden="true">
            <motion.i className="night-moon" style={{ x: moonX, y: moonY }} />
            <i className="night-ground" />
            <motion.img className="night-cast" src={asset(s.figure)} alt="" draggable="false" style={{ scaleY: -0.36, skewX: cast, originX: 0.5, originY: 1 }} />
            <motion.img className="night-figure" src={asset(s.figure)} alt="" draggable="false" style={{ x: lean }} />
          </div>
        )}
      </div>
    </header>
  )
}

/* The poster beside the text leans toward the pointer, like a card held in the hand. */
function Poster({ src, alt }) {
  const { ref, x, y, move, rest } = usePointer()
  const rotateY = useTransform(x, [-1, 1], [-14, 14]), rotateX = useTransform(y, [-1, 1], [10, -10])
  const shine = useTransform(x, [-1, 1], ['20%', '80%'])
  return (
    <div ref={ref} className="tilt" onMouseMove={move} onMouseLeave={rest}>
      <motion.div className="tilt-card" style={{ rotateX, rotateY }}>
        <img src={asset(src)} alt={alt} loading="lazy" />
        <motion.i style={{ left: shine }} />
      </motion.div>
    </div>
  )
}

/* The project's art as a row of leaning comic panels. The one you point at (or tab to) opens
   wide and the others make room; a click shows it large. On a phone the panels sit two across. */
function Panels({ items }) {
  const [at, setAt] = useState(0)
  const [sel, setSel] = useState(null)
  return (
    <>
      <ul className="panels">
        {items.map((g, i) => (
          <li key={`${g.src}-${i}`} className={i === at ? 'on' : ''}>
            <button type="button" onMouseEnter={() => setAt(i)} onFocus={() => setAt(i)} onClick={() => setSel(i)} aria-label={`Open ${g.title || 'picture'}`}>
              <img src={asset(g.src)} alt={g.title || ''} loading="lazy" draggable="false" />
              <span className="panels-cap"><b>{String(i + 1).padStart(2, '0')}</b>{g.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <Lightbox items={items} sel={sel} setSel={setSel} />
    </>
  )
}

function Goal() {
  const raised = Number(support.goalRaised) || 0, target = Number(support.goalTarget) || 0
  if (!target) return null
  const sign = support.goalSign || '$'
  const share = Math.max(0, Math.min(1, raised / target))
  return (
    <div className="goal">
      <div className="goal-head">
        <strong>{support.goalLabel || 'Goal'}</strong>
        <span>{sign}{raised.toLocaleString('en')} of {sign}{target.toLocaleString('en')}</span>
      </div>
      <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={raised} aria-label={support.goalLabel || 'Goal'}>
        <i style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  )
}

/* The "any amount" payment link, with the amount the giver typed sent along where the payment
   service takes one in the address: a Stripe link opens with it already filled in, a PayPal.me
   address takes it as its last part. Anywhere else the giver types it again on the payment page. */
function withAmount(link, amount) {
  const cents = Math.round(Number(amount) * 100)
  if (!link || !Number.isFinite(cents) || cents < 100) return link
  try {
    const url = new URL(link)
    if (/(^|\.)stripe\.com$/.test(url.hostname)) { url.searchParams.set('__prefilled_amount', String(cents)); return url.href }
    if (/(^|\.)paypal\.me$/.test(url.hostname)) { url.pathname = `${url.pathname.replace(/\/+$/, '')}/${cents / 100}`; return url.href }
  } catch { /* not an address that can be added to: use it as it is */ }
  return link
}

/* Giving, the way a tip jar works: pick an amount or type your own, read what it does, press
   one button. The button opens the payment link the artist set for that amount. */
function Give() {
  const s = support
  const sign = s.goalSign || '$'
  const custom = safeUrl(s.customUrl)
  const options = [
    ...s.tiers.filter((t) => t && t.amount).map((t) => ({ chip: t.amount, name: t.name, text: t.text, url: safeUrl(t.url), button: `Give ${t.amount}` })),
    { own: true, chip: 'Other', name: s.customLabel, text: 'Type what you would like to give.', url: custom },
  ]
  const [at, setAt] = useState(Math.min(1, options.length - 1)) // start on the middle amount
  const [typed, setTyped] = useState('')
  const cur = options[at]
  const amount = Number(typed) > 0 ? Number(typed) : 0
  const url = cur.own ? withAmount(cur.url, amount) : cur.url
  const button = cur.own ? (amount ? `Give ${sign}${amount.toLocaleString('en')}` : s.customLabel) : cur.button
  const open = options.some((o) => o.url)
  return (
    <div className={`give ${s.giveArt ? '' : 'is-plain'}`}>
      <div className="give-main">
        <div className="label accent">{s.supportLabel}</div>
        <h2 className="display h-lg">{s.supportTitle}</h2>
        {s.supportText && <p className="lead">{s.supportText}</p>}
        <Goal />
        <div className="give-chips" role="radiogroup" aria-label="Amount">
          {options.map((o, i) => (
            <button key={`${o.chip}-${i}`} type="button" role="radio" aria-checked={i === at} className={i === at ? 'on' : ''} onClick={() => setAt(i)}>{o.chip}</button>
          ))}
        </div>
        {cur.own && (
          <label className="give-own">
            <span>{sign}</span>
            <input type="number" inputMode="decimal" min="1" step="1" placeholder="25" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Your amount" autoFocus />
          </label>
        )}
        <div className="give-about" aria-live="polite">
          <strong>{cur.name}</strong>
          {cur.text && <span>{cur.text}</span>}
        </div>
        {url
          ? <Magnetic><a className="btn give-go" href={url} target="_blank" rel="noopener noreferrer">{button} <span className="arrow">↗</span></a></Magnetic>
          : <span className="btn give-go is-off" aria-disabled="true">{open ? 'Not open yet' : s.soonTitle.replace(/\.$/, '')}</span>}
        {open
          ? s.payNote && <p className="give-note">{s.payNote}</p>
          : <p className="give-note">{s.soonText} {brand.email && <a href={`mailto:${brand.email}`}>{brand.email}</a>}</p>}
        {s.notes.length > 0 && <ul className="give-points">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </div>
      {s.giveArt && <div className="give-art" aria-hidden="true"><img src={asset(s.giveArt)} alt="" loading="lazy" draggable="false" /></div>}
    </div>
  )
}

export default function Support() {
  const s = support
  const art = s.art.filter((a) => a && a.src)
  return (
    <Page title={s.title || 'Support'} className="page-night">
      <Night />

      {(s.paragraphs.length > 0 || s.facts.length > 0) && (
        <section className="section">
          <div className={`container project-about ${s.poster ? '' : 'is-plain'}`}>
            <div>
              <div className="label accent">{s.aboutLabel}</div>
              <h2 className="display h-lg">{s.aboutTitle}</h2>
              {s.paragraphs.map((p, i) => <Reveal as="p" key={i} delay={i * 0.06} className={i === 0 ? 'lead' : 'dim'}>{p}</Reveal>)}
              {s.facts.length > 0 && (
                <Reveal as="dl" className="spec" delay={0.1}>
                  {s.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
                </Reveal>
              )}
            </div>
            {s.poster && <Reveal delay={0.1}><Poster src={s.poster} alt={`${s.title} poster`} /></Reveal>}
          </div>
        </section>
      )}

      {art.length > 0 && (
        <section className="section tight" id="art">
          <div className="container">
            <div className="section-head"><div><div className="label accent">{s.artLabel}</div><h2 className="display h-lg">{s.artTitle}</h2></div></div>
            <Reveal><Panels items={art} /></Reveal>
          </div>
        </section>
      )}

      <section className="section" id="back">
        <div className="container"><Reveal><Give /></Reveal></div>
      </section>
    </Page>
  )
}
