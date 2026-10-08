import { brand, commissions } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Picker from '../components/Picker'
import { useSendForm } from '../data/contact'

export default function Commissions() {
  const { open, title, intro, tiers, steps, notes, processLabel, processTitle, requestLabel, requestTitle, closedTitle, closedText } = commissions
  const kinds = [...tiers.map((t) => t.name), 'Something else']
  // the request is sent by the site itself, straight to the artist's inbox (api/contact.js); with a
  // form service set in the admin it goes there instead
  const byService = Boolean(brand.contactAction)
  const { send, state, problem, fallback, again } = useSendForm('commission')
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
                <div className="tier-price">{t.price || 'Ask for a quote'}</div>
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

      <section className="section" id="request">
        <div className="container request">
          <Reveal>
            <div className="label accent">{requestLabel}</div>
            <h2 className="display h-lg">{open ? requestTitle : closedTitle}</h2>
            {!open && closedText && <p className="dim">{closedText}</p>}
            {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </Reveal>
          <Reveal delay={0.1}>
            {state === 'sent' ? (
              <div className="form-sent" role="status">
                <i aria-hidden="true">✓</i>
                <div><strong>Request sent</strong><span>Thank you. I will write back by email with a quote.</span></div>
                <button type="button" className="btn ghost sm" onClick={again}>Send another</button>
              </div>
            ) : (
            <form onSubmit={byService ? undefined : send} action={brand.contactAction || undefined} method={byService ? 'post' : undefined}>
              <div className="field"><input id="c-name" name="name" type="text" placeholder=" " required autoComplete="name" /><label htmlFor="c-name">Your name</label><span className="bar" /></div>
              <div className="field"><input id="c-email" name="email" type="email" placeholder=" " required autoComplete="email" /><label htmlFor="c-email">Email</label><span className="bar" /></div>
              <Picker label="What kind of piece" name="kind" options={kinds} />
              <div className="field"><textarea id="c-idea" name="idea" placeholder=" " required rows={5} /><label htmlFor="c-idea">The idea: who or what, the mood, the pose</label><span className="bar" /></div>
              <div className="field"><input id="c-refs" name="refs" type="text" placeholder=" " /><label htmlFor="c-refs">Link to reference pictures (optional)</label><span className="bar" /></div>
              <div className="field"><input id="c-due" name="due" type="text" placeholder=" " /><label htmlFor="c-due">Needed by (optional)</label><span className="bar" /></div>
              <input className="hp-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
              <Magnetic><button className="btn" type="submit" disabled={state === 'sending'} aria-busy={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send the request'} <span className="arrow">→</span></button></Magnetic>
              {problem && <p className="form-alt is-bad" role="alert">{problem}{fallback && (brand.email || brand.instagram) && <> {brand.email ? <>Write to <a href={`mailto:${brand.email}`}>{brand.email}</a></> : null}{brand.email && brand.instagram ? ', or ' : ''}{brand.instagram ? <>message me on <a href={brand.instagram} target="_blank" rel="noreferrer">Instagram</a></> : null}.</>}</p>}
              {brand.email && <p className="form-alt">Or write to <a href={`mailto:${brand.email}`}>{brand.email}</a></p>}
            </form>
            )}
          </Reveal>
        </div>
      </section>
    </Page>
  )
}
