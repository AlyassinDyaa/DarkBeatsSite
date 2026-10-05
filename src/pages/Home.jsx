import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { asset, brand, commissions, day, events, galleryHome, hero, home, latest, marquee, nameParts, redraws, shows, support, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Marquee from '../components/Marquee'
import Poster from '../components/Poster'
import PosterWall from '../components/PosterWall'
import Compare from '../components/Compare'
import GalleryGrid from '../components/GalleryGrid'
import ViewSwitch from '../components/ViewSwitch'
import Lightbox from '../components/Lightbox'
import { useFinePointer, useReducedMotion } from '../hooks/useMedia'
import { useGalleryView } from '../hooks/useGalleryView'

/* The name is built in depth, with a cut-out character at its left. The character is either the
   back layer, with both words of the name in front of it, or the middle one, standing between
   the first word and the second (the admin chooses). The three layers really are at different distances
   (translateZ under one perspective), so when the whole name tilts toward the pointer they slide
   past each other the way near and far things do. The poster wall drifts the other way, as the
   furthest thing back. Without a mouse, or with reduced motion, the layers simply hold still. */
function Hero({ onOpen }) {
  const ref = useRef(null)
  const [a, b] = nameParts(brand.name)
  const figure = hero.figure?.src ? hero.figure : null
  const fine = useFinePointer(), reduced = useReducedMotion()
  const live = fine && !reduced
  const mx = useMotionValue(0), my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 70, damping: 18 }), sy = useSpring(my, { stiffness: 70, damping: 18 })
  const rotateY = useTransform(sx, [-1, 1], [-8, 8]), rotateX = useTransform(sy, [-1, 1], [6, -6])
  const wallX = useTransform(sx, [-1, 1], [16, -16]), wallY = useTransform(sy, [-1, 1], [10, -10])
  const move = (e) => {
    if (!live) return
    const r = ref.current.getBoundingClientRect()
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1); my.set(((e.clientY - r.top) / r.height) * 2 - 1)
  }
  const rest = () => { mx.set(0); my.set(0) }
  const num = (v, fallback) => (v === '' || v == null || Number.isNaN(Number(v)) ? fallback : Number(v))
  const rise = (delay) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.8, ease: [0.16, 1, 0.3, 1] } })
  return (
    <section ref={ref} className="hero" onMouseMove={move} onMouseLeave={rest}>
      <div className="container hero-inner">
        <div className={`hero-copy ${figure ? 'has-figure' : ''} ${figure?.ground ? 'has-ground' : ''} ${figure?.layer === 'behind' ? 'is-behind' : ''}`}>
          <motion.div className="label accent" {...rise(1.0)}>{hero.kicker}</motion.div>
          <motion.h1
            className="hero-name"
            aria-label={brand.name}
            style={{ rotateX, rotateY, '--fig-size': num(figure?.size, 100) / 100, '--fig-x': num(figure?.x, 0), '--fig-y': num(figure?.y, 0) }}
          >
            <span className="hero-line"><motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 1.0, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>{a}</motion.span></span>
            {figure && (
              <>
                <span className="hero-aura" aria-hidden="true" />
                <span className="hero-figure" aria-hidden="true">
                  <motion.span initial={{ opacity: 0, y: '8%' }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.25, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}>
                    <img src={asset(figure.src)} alt="" draggable="false" />
                  </motion.span>
                </span>
              </>
            )}
            {b && <span className="hero-line is-front"><motion.span className="is-accent" initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 1.1, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>{b}</motion.span></span>}
          </motion.h1>
          <motion.p className="hero-tag" {...rise(1.35)}>{brand.tagline}</motion.p>
          <motion.p className="lead" {...rise(1.45)}>{hero.text}</motion.p>
          <motion.div className="hero-actions" {...rise(1.55)}>
            {shows('pages', 'gallery') && <Magnetic><Link className="btn" to="/work">{hero.primaryLabel} <span className="arrow">→</span></Link></Magnetic>}
            {shows('pages', 'commissions') && <Magnetic><Link className="btn ghost" to="/commissions">{hero.secondaryLabel}</Link></Magnetic>}
          </motion.div>
        </div>
        <motion.div className="hero-wall" style={{ x: wallX, y: wallY }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 1.2 }}>
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
          {shows('pages', 'work') && <Link className="btn ghost sm" to="/shop">All {work.length} pieces <span className="arrow">→</span></Link>}
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
  const [view, setView] = useGalleryView()
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
              <div className="section-tools">
                <ViewSwitch view={view} onChange={setView} />
                {shows('pages', 'gallery') && <Link className="btn ghost sm" to="/work">All the work <span className="arrow">→</span></Link>}
              </div>
            </div>
            <GalleryGrid items={galleryHome} view={view} />
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

      {/* The artist's own project */}
      {shows('home', 'support') && shows('pages', 'support') && (
        <section className="section">
          <div className="container">
            <Reveal className="invite">
              <div className="invite-copy">
                {support.homeLabel && <div className="label accent">{support.homeLabel}</div>}
                <h2 className={support.logo ? 'project-logo' : 'display h-lg'}>{support.logo ? <img src={asset(support.logo)} alt={support.title} loading="lazy" /> : support.title}</h2>
                {support.homeText && <p className="lead">{support.homeText}</p>}
                <Magnetic><Link className="btn" to="/support">{support.homeButton} <span className="arrow">→</span></Link></Magnetic>
              </div>
              {support.poster && <div className="invite-art" aria-hidden="true"><img src={asset(support.poster)} alt="" loading="lazy" /></div>}
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
