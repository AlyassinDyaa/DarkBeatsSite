import { asset, brand, safeUrl, support } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import GalleryGrid from '../components/GalleryGrid'

/* The Support page: the artist's own project (what it is, its art) and the ways to back it.
   Money never touches this site. Each way to give is a payment link the artist made with a
   payment service (a Stripe Payment Link, Ko-fi, PayPal.me...) and pasted into the admin; a
   button here simply opens it. Until the first link is in, the page says support is on its way. */
function Goal() {
  const raised = Number(support.goalRaised) || 0, target = Number(support.goalTarget) || 0
  if (!target) return null
  const sign = support.goalSign || '$'
  const share = Math.max(0, Math.min(1, raised / target))
  return (
    <Reveal className="goal">
      <div className="goal-head">
        <strong>{support.goalLabel || 'Goal'}</strong>
        <span>{sign}{raised.toLocaleString('en')} of {sign}{target.toLocaleString('en')}</span>
      </div>
      <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={raised} aria-label={support.goalLabel || 'Goal'}>
        <i style={{ width: `${share * 100}%` }} />
      </div>
    </Reveal>
  )
}

export default function Support() {
  const s = support
  const tiers = s.tiers.filter((t) => t && (t.name || t.amount))
  const custom = safeUrl(s.customUrl)
  const open = Boolean(custom) || tiers.some((t) => safeUrl(t.url))
  const art = s.art.filter((a) => a && a.src)
  return (
    <Page title={s.title || 'Support'}>
      <header className="project-hero">
        <div className="container project-hero-inner">
          <div className="project-copy">
            {s.label && <div className="label accent">{s.label}</div>}
            <h1 className={s.logo ? 'project-logo' : 'display h-xl'}>
              {s.logo ? <img src={asset(s.logo)} alt={s.title} /> : s.title}
            </h1>
            {s.intro && <p className="lead">{s.intro}</p>}
            <div className="hero-actions">
              <Magnetic><a className="btn" href="#back">{s.primaryLabel} <span className="arrow">↓</span></a></Magnetic>
              {art.length > 0 && <Magnetic><a className="btn ghost" href="#art">See the art</a></Magnetic>}
            </div>
          </div>
          {s.figure && (
            <div className="project-figure" aria-hidden="true">
              <i />
              <img src={asset(s.figure)} alt="" draggable="false" />
            </div>
          )}
        </div>
      </header>

      {(s.paragraphs.length > 0 || s.facts.length > 0) && (
        <section className="section">
          <div className={`container project-about ${s.poster ? '' : 'is-plain'}`}>
            <div>
              <div className="section-head"><div><div className="label accent">{s.aboutLabel}</div><h2 className="display h-lg">{s.aboutTitle}</h2></div></div>
              {s.paragraphs.map((p, i) => <Reveal as="p" key={i} delay={i * 0.06} className={i === 0 ? 'lead' : 'dim'}>{p}</Reveal>)}
              {s.facts.length > 0 && (
                <Reveal as="dl" className="facts" delay={0.1}>
                  {s.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
                </Reveal>
              )}
            </div>
            {s.poster && <Reveal className="project-poster" delay={0.1}><img src={asset(s.poster)} alt={`${s.title} poster`} loading="lazy" /></Reveal>}
          </div>
        </section>
      )}

      {art.length > 0 && (
        <section className="section" id="art">
          <div className="container">
            <div className="section-head"><div><div className="label accent">{s.artLabel}</div><h2 className="display h-lg">{s.artTitle}</h2></div></div>
            <GalleryGrid items={art} view="wall" />
          </div>
        </section>
      )}

      <section className="section" id="back">
        <div className="container">
          <div className="back">
            <div className="section-head">
              <div><div className="label accent">{s.supportLabel}</div><h2 className="display h-lg">{s.supportTitle}</h2></div>
              {s.supportText && <p className="dim section-note">{s.supportText}</p>}
            </div>
            <Goal />
            {tiers.length > 0 && (
              <ul className="gifts">
                {tiers.map((t, i) => {
                  const url = safeUrl(t.url)
                  return (
                    <Reveal as="li" key={`${t.name}-${i}`} delay={i * 0.07} className="gift">
                      <div className="gift-amount">{t.amount}</div>
                      <h3 className="display h-sm">{t.name}</h3>
                      {t.text && <p className="dim">{t.text}</p>}
                      {url && <a className="btn sm" href={url} target="_blank" rel="noopener noreferrer">Give {t.amount} <span className="arrow">↗</span></a>}
                    </Reveal>
                  )
                })}
              </ul>
            )}
            <Reveal className="back-foot">
              {custom && <a className="btn ghost" href={custom} target="_blank" rel="noopener noreferrer">{s.customLabel} <span className="arrow">↗</span></a>}
              {!open && (
                <p className="back-soon">
                  <strong>{s.soonTitle}</strong> {s.soonText}{' '}
                  {brand.email && <a href={`mailto:${brand.email}`}>{brand.email}</a>}
                </p>
              )}
              {open && s.payNote && <p className="back-note">{s.payNote}</p>}
            </Reveal>
            {s.notes.length > 0 && <ul className="notes back-notes">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>
        </div>
      </section>
    </Page>
  )
}
