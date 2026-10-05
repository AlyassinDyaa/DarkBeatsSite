import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { buyable, categories, day, home, money, pages, redraws, shop, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Poster from '../components/Poster'
import Compare from '../components/Compare'
import Lightbox from '../components/Lightbox'

/* Every piece. While online purchases are switched on (in the admin), each piece with a price
   shows it, and opening the piece offers the Buy button. Stripe sends a buyer back here with
   "?thanks=1", which shows the thank-you line. */
export default function Shop() {
  const [params] = useSearchParams()
  const thanks = params.get('thanks') === '1'
  const [filter, setFilter] = useState('All')
  const [sel, setSel] = useState(null)
  const shown = useMemo(() => (filter === 'All' ? work : work.filter((p) => p.category === filter)), [filter])
  const count = (c) => (c === 'All' ? work.length : work.filter((p) => p.category === c).length)
  const choose = (c) => { setSel(null); setFilter(c) }
  return (
    <Page title="Shop">
      <header className="page-head container">
        {pages.work.label && <div className="label accent">{pages.work.label}</div>}
        <h1 className="display h-xl">{pages.work.title}</h1>
        {pages.work.intro && <p className="lead">{pages.work.intro}</p>}
        {thanks && (
          <motion.div className="thanks" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <i aria-hidden="true">✓</i>
            <div><strong>{shop.thanksTitle}</strong><span>{shop.thanksText}</span></div>
          </motion.div>
        )}
        {shop.enabled && !thanks && (
          <ol className="how-buy">
            <li><b>01</b>Pick a piece</li>
            <li><b>02</b>Pay securely with Stripe</li>
            <li><b>03</b>{shop.shipping !== false ? 'Posted to your door' : 'Sent to your inbox'}</li>
          </ol>
        )}
        {categories.length > 1 && (
          <div className="filters" role="group" aria-label="Show">
            {['All', ...categories].map((c) => (
              <button key={c} type="button" className={`chip ${filter === c ? 'on' : ''}`} aria-pressed={filter === c} onClick={() => choose(c)}>
                {c}<small>{count(c)}</small>
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="section tight">
        <div className="container">
          <motion.ul className="grid" layout>
            <AnimatePresence mode="popLayout" initial={false}>
              {shown.map((p, i) => (
                <motion.li key={p.slug} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                  <button type="button" className="tile" onClick={() => setSel(i)}>
                    <span className="tile-art">
                      <Poster title={p.title} hue={p.hue} src={p.src} seed={work.indexOf(p)} eager={i < 4} />
                      {buyable(p) && <span className="tile-price">{money(p.price)}</span>}
                      <span className="tile-cta">{buyable(p) ? 'View & buy' : 'View'} <span className="arrow">→</span></span>
                    </span>
                    <span className="tile-cap">
                      <strong>{p.title}</strong>
                      <small>{[p.category, day(p.date)].filter(Boolean).join(' · ')}</small>
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </div>
      </section>

      {redraws.length > 0 && filter === 'All' && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div><div className="label accent">{home.redrawLabel}</div><h2 className="display h-lg">{home.redrawTitle}</h2></div>
            </div>
            <div className="compare-grid">
              {redraws.map((r, i) => <Reveal key={r.slug} delay={i * 0.1}><Compare set={r} seed={i} /></Reveal>)}
            </div>
          </div>
        </section>
      )}

      <Lightbox items={shown} sel={sel} setSel={setSel} />
    </Page>
  )
}
