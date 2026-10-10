import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { brand, commissions, quote, shows } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import { QuoteGo, quoteSign } from '../components/QuoteLink'
import { useSendForm } from '../data/contact'
import { useAccount } from '../hooks/useAccount'
import { askCommissions } from '../components/AccountCommissions'

/* One field of the request: its label always showing, an optional hint, and its problem (if any)
   tied to it, so a screen reader reads them with the field. */
function Field({ id, label, hint, error, textarea = false, required = false, ...rest }) {
  const described = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined
  const Tag = textarea ? 'textarea' : 'input'
  return (
    <div className={`cmr-field ${error ? 'is-bad' : ''}`}>
      <label htmlFor={id}>{label}{required ? <span className="cmr-req" aria-hidden="true"> *</span> : <small> (optional)</small>}</label>
      <Tag id={id} required={required} aria-required={required ? 'true' : undefined} aria-invalid={error ? 'true' : undefined} aria-describedby={described} {...(textarea ? {} : { type: 'text' })} {...rest} />
      {hint && <small id={`${id}-hint`} className="cmr-hint">{hint}</small>}
      {error && <small id={`${id}-err`} className="cmr-err">{error}</small>}
    </div>
  )
}

/* The kind of piece: a card for each offer on this page (its name and price, when set), and
   "Something else". Radio buttons underneath, so arrows and Tab work, and the form sends it. */
function KindPicker({ options, value, onChange }) {
  return (
    <fieldset className="cmr-group">
      <legend id="cmr-kind-legend">What kind of piece <span className="cmr-req" aria-hidden="true">*</span><span className="sr-only"> (required)</span></legend>
      <div className="cmr-kinds" role="radiogroup" aria-labelledby="cmr-kind-legend" aria-required="true">
        {options.map((o) => (
          <label key={o.name} className={`cmr-kind ${value === o.name ? 'on' : ''}`}>
            <input type="radio" name="kind" value={o.name} checked={value === o.name} onChange={() => onChange(o.name)} />
            <strong>{o.name}</strong>
            <small>{o.price || (o.other ? 'Tell me below' : 'Priced by quote')}</small>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// other ways to reach the artist, under every form
function Elsewise() {
  if (!brand.email && !brand.instagram) return null
  return (
    <p className="form-alt">
      {brand.email && <>Or write to <a href={`mailto:${brand.email}`}>{brand.email}</a>. </>}
      {brand.instagram && <>For a quick question, <a href={brand.instagram} target="_blank" rel="noreferrer">message me on Instagram</a>.</>}
    </p>
  )
}

/* Commissions closed (Page text → Commissions → Commissions are open): no request form, only the
   admin's words and the way to write. Commissions already asked for carry on in the account. */
function Closed({ text }) {
  const { user } = useAccount()
  return (
    <div className="cmr-closed">
      {text && <p className="cmr-closed-text">{text}</p>}
      <p>{brand.email ? <>Questions, or want to hear when they open? Write to <a href={`mailto:${brand.email}`}>{brand.email}</a>.</> : 'Check back soon: new requests open here again.'}</p>
      {user && <Link className="btn ghost sm" to="/account?tab=orders&view=commissions">Your commissions <span className="arrow">→</span></Link>}
    </div>
  )
}

/* A request made from the customer's account (api/commissions.js): it opens a commission they
   follow there, the conversation, the quote and each stage. Without a login, the way in. The kind
   of piece is held by the page, so an offer's quote button can pick it. */
function AccountRequest({ options, kind, setKind, picked = false }) {
  const { user } = useAccount()
  const opened = useRef(Date.now())
  const [state, setState] = useState('')
  const [problem, setProblem] = useState('')
  const [errors, setErrors] = useState({})
  const [made, setMade] = useState(null)
  const next = encodeURIComponent(`/commissions${picked ? `?kind=${encodeURIComponent(kind)}` : ''}#request`)
  const send = async (e) => {
    e.preventDefault()
    if (state === 'sending') return
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    if (data.website || Date.now() - opened.current < 2500) return // a bot: the hidden field, or too quick
    // checked here first, so the problem shows by its field
    if (String(data.idea || '').trim().length < 2) { setErrors({ idea: 'Tell me the idea: a sentence or two is enough.' }); setProblem(''); form.elements.idea?.focus(); return }
    setState('sending'); setProblem(''); setErrors({})
    try {
      const s = await askCommissions('request', { kind, idea: data.idea, refs: data.refs, size: data.size, budget: data.budget, due: data.due })
      setMade(s.commission); setState('sent'); form.reset()
    } catch (err) {
      if (err.field) { setErrors({ [err.field]: err.message }); form.elements[err.field]?.focus() } else setProblem(err.message)
      setState('failed')
    }
  }
  if (!user) return (
    <div className="cm-login">
      <strong>Log in or make an account to request a commission</strong>
      <p>Your request, our conversation, the quote and every stage of the piece stay together in your account.{picked && kind !== 'Something else' ? <> You picked <b>{kind}</b>: it is kept for when you are back.</> : null}</p>
      <div className="cm-login-go">
        <Link className="btn sm" to={`/account/login?next=${next}`}>Log in <span className="arrow">→</span></Link>
        <Link className="btn ghost sm" to={`/account/signup?next=${next}`}>Make an account</Link>
      </div>
      <Elsewise />
    </div>
  )
  if (state === 'sent' && made) return (
    <div className="form-sent" role="status">
      <i aria-hidden="true">✓</i>
      <div><strong>Request sent</strong><span>Follow it in your account: commission {made.number}. I will write back there (and by email) with questions and a quote.</span></div>
      <div className="cm-sent-go">
        <Link className="btn sm" to={`/account?tab=orders&view=commissions&c=${made.id}`}>Follow it in your account <span className="arrow">→</span></Link>
        <button type="button" className="btn ghost sm" onClick={() => { setState(''); setMade(null) }}>Send another</button>
      </div>
    </div>
  )
  return (
    <form className="cmr-form" onSubmit={send} noValidate aria-describedby={problem ? 'cmr-problem' : undefined}>
      <KindPicker options={options} value={kind} onChange={setKind} />
      <fieldset className="cmr-group">
        <legend>The idea</legend>
        <Field id="c-idea" name="idea" label="What should I draw?" hint="Who or what, the mood, the pose." textarea rows={4} maxLength={5000} required error={errors.idea} />
        <Field id="c-refs" name="refs" label="Links to reference pictures" hint="Paste one or more links, separated by spaces." maxLength={2000} error={errors.refs} />
      </fieldset>
      <fieldset className="cmr-group">
        <legend>Details</legend>
        <div className="cmr-row">
          <Field id="c-size" name="size" label="Size" placeholder="A4, A3…" maxLength={120} error={errors.size} />
          <Field id="c-budget" name="budget" label="Budget" placeholder="$…" maxLength={120} error={errors.budget} />
          <Field id="c-due" name="due" label="Needed by" placeholder="A date, or no rush" maxLength={120} error={errors.due} />
        </div>
      </fieldset>
      <input className="hp-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="cmr-actions">
        <Magnetic><button className="btn cmr-send" type="submit" disabled={state === 'sending'} aria-busy={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send request'} <span className="arrow">→</span></button></Magnetic>
        <small className="cmr-after">I answer in your account, with a quote. Nothing is paid until you accept it.</small>
      </div>
      {problem && <p id="cmr-problem" className="form-alt is-bad" role="alert">{problem}</p>}
      <Elsewise />
    </form>
  )
}

/* Without customer accounts: the request is emailed to the artist (api/contact.js), as before. */
function EmailRequest({ options, kind, setKind }) {
  const { send, state, problem, fallback, again } = useSendForm('commission')
  const byService = Boolean(brand.contactAction) // a form service set in the admin takes it instead
  if (state === 'sent') return (
    <div className="form-sent" role="status">
      <i aria-hidden="true">✓</i>
      <div><strong>Request sent</strong><span>Thank you. I will write back by email with a quote.</span></div>
      <button type="button" className="btn ghost sm" onClick={again}>Send another</button>
    </div>
  )
  return (
    <form className="cmr-form" onSubmit={byService ? undefined : send} action={brand.contactAction || undefined} method={byService ? 'post' : undefined} aria-describedby={problem ? 'cmr-problem' : undefined}>
      <fieldset className="cmr-group">
        <legend>You</legend>
        <div className="cmr-row is-two">
          <Field id="c-name" name="name" label="Your name" required autoComplete="name" maxLength={80} />
          <Field id="c-email" name="email" label="Email" type="email" required autoComplete="email" maxLength={254} />
        </div>
      </fieldset>
      <KindPicker options={options} value={kind} onChange={setKind} />
      <fieldset className="cmr-group">
        <legend>The idea</legend>
        <Field id="c-idea" name="idea" label="What should I draw?" hint="Who or what, the mood, the pose." textarea rows={4} maxLength={5000} required />
        <div className="cmr-row is-two">
          <Field id="c-refs" name="refs" label="Link to reference pictures" maxLength={2000} />
          <Field id="c-due" name="due" label="Needed by" maxLength={120} />
        </div>
      </fieldset>
      <input className="hp-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="cmr-actions">
        <Magnetic><button className="btn cmr-send" type="submit" disabled={state === 'sending'} aria-busy={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send request'} <span className="arrow">→</span></button></Magnetic>
      </div>
      {problem && <p id="cmr-problem" className="form-alt is-bad" role="alert">{problem}{fallback && brand.email ? <> Write to <a href={`mailto:${brand.email}`}>{brand.email}</a> instead.</> : null}</p>}
      <Elsewise />
    </form>
  )
}

export default function Commissions() {
  const { open, title, intro, tiers, steps, notes, processLabel, processTitle, requestLabel, requestTitle, closedTitle, closedText } = commissions
  // the kinds of piece to pick from in the request: each offer (with its price), and anything else
  const kindOptions = [...tiers.map((t) => ({ name: t.name, price: t.price || '' })), { name: 'Something else', price: '', other: true }]
  const location = useLocation()
  const asked = new URLSearchParams(location.search).get('kind') || ''
  const [kind, setKind] = useState(() => (kindOptions.some((o) => o.name === asked) ? asked : kindOptions[0].name))
  const [picked, setPicked] = useState(() => kindOptions.some((o) => o.name === asked)) // chosen on an offer (or in the address)
  const requestRef = useRef(null)
  // to the request card: an offer's quote button here, or a link from elsewhere (…/commissions?kind=Bust#request)
  const toRequest = () => {
    const el = requestRef.current
    if (!el) return
    if (window.__lenis) window.__lenis.scrollTo(el, { offset: -90, duration: 0.9 }); else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const choose = (name) => { setKind(name); setPicked(true); toRequest() }
  useEffect(() => {
    if (asked && kindOptions.some((o) => o.name === asked)) { setKind(asked); setPicked(true) }
    if (location.hash !== '#request') return undefined
    const t = setTimeout(toRequest, 450) // after the page's own scroll to the top
    return () => clearTimeout(t)
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps
  // with customer accounts on, a request is made from the account (and needs a login); without, it is emailed as before
  const account = useAccount()
  // the request card can be switched off (Site → Show / hide → Commissions → Request form): the
  // offers and the steps stay; a quote button shows only where it leads somewhere else
  const asking = shows('commissions', 'request')
  return (
    <Page title="Commissions">
      <header className="page-head container">
        <div className={`status ${open ? 'on' : ''}`}><i />{open ? 'Commissions are open' : 'Commissions are closed right now'}</div>
        <h1 className="display h-xl">{title}</h1>
        <p className="lead">{intro}</p>
      </header>

      {tiers.length > 0 && (
        <section className="section tight">
          <div className="container tiers">
            {tiers.map((t, i) => (
              <Reveal key={t.name} delay={i * 0.08} className="tier">
                <h2 className="display h-md">{t.name}</h2>
                <p className="dim">{t.text}</p>
                {t.includes?.length > 0 && <ul>{t.includes.map((x) => <li key={x}>{x}</li>)}</ul>}
                {/* the price, and the way to a quote: the request card here (with this offer picked), or where the admin sends quotes */}
                {quote.via !== 'site'
                  ? <QuoteGo className="tier-price tier-go" tier={t.name}><span>{t.price || quote.label}</span><i aria-hidden="true">{quoteSign()}</i></QuoteGo>
                  : !asking
                    ? t.price ? <div className="tier-price">{t.price}</div> : null
                  : quote.closed
                    ? <div className="tier-price tier-go is-closed"><span>{t.price || quote.label}</span><small>Closed for now</small></div>
                    : <button type="button" className="tier-price tier-go" onClick={() => choose(t.name)} aria-label={`${quote.label}: ${t.name}${t.price ? `, ${t.price}` : ''}`}><span>{t.price || quote.label}</span><i aria-hidden="true">→</i></button>}
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {steps.length > 0 && (
        <section className="section tight">
          <div className="container">
            <div className="section-head"><div><div className="label accent">{processLabel}</div><h2 className="display h-lg">{processTitle}</h2></div></div>
            <ol className="steps">
              {steps.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 0.08}>
                  <span className="steps-n">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="display h-sm">{s.title}</h3>
                  <p className="dim">{s.text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* the request: one dark card, its purple strip saying whether commissions are open (and who is
          asking); the points to know beside the form (above it on a phone). Closed: no form. */}
      {asking && <section className="section" id="request" ref={requestRef}>
        <div className="container">
          {requestLabel && <div className="label accent cmr-label">{requestLabel}</div>}
          <Reveal className={`cmr ${open ? '' : 'is-closed'}`}>
            <header className="cmr-head">
              <div className="cmr-head-top">
                <div className={`status ${open ? 'on' : ''}`}><i />{open ? 'Commissions are open' : 'Commissions are closed right now'}</div>
                {open && account.user && <p className="cm-as">Asking as <b>{account.user.name || account.user.email}</b></p>}
              </div>
              <h2 className="cmr-title">{open ? requestTitle : closedTitle}</h2>
            </header>
            <div className="cmr-body">
              {notes.length > 0 && (
                <aside className="cmr-notes" aria-labelledby="cmr-notes-title">
                  <h3 id="cmr-notes-title">Good to know</h3>
                  <ul>{notes.map((x) => <li key={x}>{x}</li>)}</ul>
                </aside>
              )}
              <div className="cmr-main">
                {!open ? <Closed text={closedText} />
                  : !account.ready ? <p className="form-alt">One moment…</p>
                    : account.on ? <AccountRequest options={kindOptions} kind={kind} setKind={(k) => { setKind(k); setPicked(true) }} picked={picked} />
                      : <EmailRequest options={kindOptions} kind={kind} setKind={setKind} />}
              </div>
            </div>
          </Reveal>
        </div>
      </section>}
    </Page>
  )
}
