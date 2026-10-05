import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { brand, commissions, day, events, galleryHome, hero, home, latest, marquee, nameParts, redraws, shows, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Marquee from '../components/Marquee'
import Poster from '../components/Poster'
import PosterWall from '../components/PosterWall'
import Compare from '../components/Compare'
import GalleryGrid from '../components/GalleryGrid'
import Lightbox from '../components/Lightbox'

function Hero({ onOpen }) {
  const [a, b] = nameParts(brand.name)
  const rise = (delay) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.8, ease: [0.16, 1, 0.3, 1] } })
  return (
    <section className="hero">
      <div className="container hero-inner">
        <div className="hero-copy">
          <motion.div className="label accent" {...rise(1.0)}>{hero.kicker}</motion.div>
          <h1 className="hero-name" aria-label={brand.name}>
            <span className="hero-line"><motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 1.0, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>{a}</motion.span></span>
            {b && <span className="hero-line"><motion.span className="is-accent" initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 1.1, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>{b}</motion.span></span>}
          </h1>
          <motion.p className="hero-tag" {...rise(1.35)}>{brand.tagline}</motion.p>
          <motion.p className="lead" {...rise(1.45)}>{hero.text}</motion.p>
          <motion.div className="hero-actions" {...rise(1.55)}>
            {shows('pages', 'work') && <Magnetic><Link className="btn" to="/work">{hero.primaryLabel} <span className="arrow">→</span></Link></Magnetic>}
            {shows('pages', 'commissions') && <Magnetic><Link className="btn ghost" to="/commissions">{hero.secondaryLabel}</Link></Magnetic>}
          </motion.div>
        </div>
        <motion.div className="hero-wall" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 1.2 }}>
          <PosterWall pieces={work} onOpen={onOpen} />
        </motion.div>
      </div>
    </section>
  )
}

/* The newest pieces as a list of titles. The title you point at (or tab to) is shown as a poster
   beside the list. On a phone each row carries its own thumbnail. */
function Latest({ onOpen }) {
  const [active, setActive] = useState(0)
  const cur = latest[active] || latest[0]
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div><div className="label accent">{home.latestLabel}</div><h2 className="display h-lg">{home.latestTitle}</h2></div>
          {shows('pages', 'work') && <Link className="btn ghost sm" to="/work">All {work.length} pieces <span className="arrow">→</span></Link>}
        </div>
        <div className="index">
          <div className="index-stage" aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={cur.slug} initial={{ opacity: 0, x: 30, rotate: 3 }} animate={{ opacity: 1, x: 0, rotate: 0 }} exit={{ opacity: 0, x: -30, rotate: -3 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                <Poster title={cur.title} hue={cur.hue} src={cur.src} seed={work.indexOf(cur)} />
              </motion.div>
            </AnimatePresence>
          </div>
          <ol className="index-list">
            {latest.map((p, i) => (
              <Reveal as="li" key={p.slug} delay={i * 0.05} y={20}>
                <button type="button" className={`index-row ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => onOpen(work.indexOf(p))}>
                  <span className="index-thumb"><Poster title={p.title} hue={p.hue} src={p.src} seed={work.indexOf(p)} /></span>
                  <span className="index-date">{day(p.date, true)}</span>
                  <span className="index-title">{p.title}</span>
                  <span className="index-cat">{p.category}</span>
                </button>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const [sel, setSel] = useState(null)
  return (
    <Page>
      <Hero onOpen={setSel} />
      {shows('home', 'ticker') && <Marquee items={marquee} />}

      {shows('home', 'latest') && latest.length > 0 && <Latest onOpen={setSel} />}

      {/* Gallery */}
      {shows('home', 'gallery') && galleryHome.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div><div className="label accent">{home.galleryLabel}</div><h2 className="display h-lg">{home.galleryTitle}</h2></div>
              {shows('pages', 'gallery') && <Link className="btn ghost sm" to="/gallery">Full gallery <span className="arrow">→</span></Link>}
            </div>
            <GalleryGrid items={galleryHome} />
          </div>
        </section>
      )}

      {/* Then and now */}
      {shows('home', 'redraws') && redraws.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div><div className="label accent">{home.redrawLabel}</div><h2 className="display h-lg">{home.redrawTitle}</h2></div>
              {home.redrawText && <p className="dim section-note">{home.redrawText}</p>}
            </div>
            <div className="compare-grid">
              {redraws.map((r, i) => <Reveal key={r.slug} delay={i * 0.1}><Compare set={r} seed={i} /></Reveal>)}
            </div>
          </div>
        </section>
      )}

      {/* Commissions */}
      {shows('home', 'commissions') && shows('pages', 'commissions') && (
        <section className="section">
          <div className="container">
            <Reveal className="hire">
              <div className="hire-copy">
                <div className={`status ${commissions.open ? 'on' : ''}`}><i />{commissions.open ? 'Commissions are open' : 'Commissions are closed right now'}</div>
                <h2 className="display h-lg">{home.commissionsTitle}</h2>
                <p className="lead">{commissions.intro}</p>
                <Magnetic><Link className="btn" to="/commissions">{home.commissionsButton} <span className="arrow">→</span></Link></Magnetic>
              </div>
              {commissions.tiers.length > 0 && (
                <ul className="hire-tiers">
                  {commissions.tiers.map((t) => (
                    <li key={t.name}>
                      <strong>{t.name}</strong>
                      <span>{t.text}</span>
                      <em>{t.price || 'Ask for a quote'}</em>
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>
          </div>
        </section>
      )}

      {/* Conventions */}
      {shows('home', 'events') && events.length > 0 && (
        <section className="section tight">
          <div className="container">
            <div className="section-head">
              <div><div className="label accent">{home.eventsLabel}</div><h2 className="display h-lg">{home.eventsTitle}</h2></div>
            </div>
            <ul className="events">
              {events.map((e, i) => (
                <Reveal as="li" key={e.slug} delay={i * 0.06} y={20}>
                  <a className="event" href={e.url || undefined} target={e.url ? '_blank' : undefined} rel="noreferrer">
                    <span className="event-when">{e.when}</span>
                    <span className="event-name">{e.name}</span>
                    <span className="event-where">{[e.role, e.place].filter(Boolean).join(' · ')}</span>
                    {e.url && <span className="arrow" aria-hidden="true">↗</span>}
                  </a>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      <Lightbox items={work} sel={sel} setSel={setSel} />
    </Page>
  )
}
