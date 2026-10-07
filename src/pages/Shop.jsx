import { useEffect, useMemo, useState } from 'react'
import { useCart } from '../hooks/useCart'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { badge, buyable, canBuy, categories, home, money, nowPrice, onSale, pages, redraws, shop, shows, soldOut, types, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Poster from '../components/Poster'
import Compare from '../components/Compare'
import Lightbox from '../components/Lightbox'
import FilterMenu from '../components/FilterMenu'

/* Every piece. While online purchases are switched on (in the admin), each piece with a price
   shows it, and opening the piece offers the Buy button. Stripe sends a buyer back here with
   "?thanks=1", which shows the thank-you line. */
/* A card's picture, price and tags. Where the price and the tags sit is set in the admin (Shop &
   payments): on the picture's top corners, or under it beside the title. A sale tag goes with the
   price when both are on the picture, so the price and its discount read together. A sold-out
   piece shows its Sold out tag and no price. */
function TileBody({ p, eager }) {
  const tag = badge(p)
  const price = buyable(p) && !soldOut(p)
  const priceUp = price && shop.pricePlace !== 'below'
  const tagsUp = shop.tagPlace !== 'below'
  const saleWithPrice = tag?.kind === 'sale' && priceUp && tagsUp
  const amount = <>{onSale(p) && <s>{money(p.price, true)}</s>}{money(nowPrice(p))}</>
  const tagEl = (extra = '') => <span className={`tile-badge is-${tag.kind} ${extra}`}>{tag.text}</span>
  return (
    <>
      <span className="tile-art">
        <Poster title={p.title} hue={p.hue} src={p.src} seed={work.indexOf(p)} eager={eager} />
        {tag && tagsUp && !saleWithPrice && tagEl()}
        {priceUp && <span className="tile-tags"><span className="tile-price">{amount}</span>{saleWithPrice && tagEl('is-under')}</span>}
        <span className="tile-cta">{canBuy(p) ? 'View & buy' : 'View'} <span className="arrow">→</span></span>
      </span>
      <span className="tile-cap">
        <span className="tile-cap-row">
          <strong>{p.title}</strong>
          {price && !priceUp && <span className="tile-cap-price">{amount}</span>}
        </span>
        <small>{[p.type, p.category].filter(Boolean).join(' · ')}</small>
        {tag && !tagsUp && <span className="tile-cap-tags">{tagEl('is-inline')}</span>}
      </span>
    </>
  )
}

export default function Shop() {
  const [params] = useSearchParams()
  const thanks = params.get('thanks') === '1'
  const cart = useCart()
  const clearCart = cart.clear
  useEffect(() => { if (thanks) clearCart() }, [thanks, clearCart])
  const [filter, setFilter] = useState('All') // subject
  const [kind, setKind] = useState('All') // type
  const [sel, setSel] = useState(null)
  // Sold-out pieces wait at the end, in their usual order; back in stock, a piece is back in its place.
  const shown = useMemo(() => {
    const list = work.filter((p) => (filter === 'All' || p.category === filter) && (kind === 'All' || p.type === kind))
    return [...list.filter((p) => !soldOut(p)), ...list.filter((p) => soldOut(p))]
  }, [filter, kind])
  // each count reads with the other drop-down’s choice, so it says what picking it would show
  const count = (field, value, other, otherValue) => work.filter((p) => (value === 'All' || p[field] === value) && (otherValue === 'All' || p[other] === otherValue)).length
  const choose = (c) => { setSel(null); setFilter(c) }
  const chooseKind = (t) => { setSel(null); setKind(t) }
  const subjectOptions = ['All', ...categories].map((c) => ({ value: c, label: c === 'All' ? 'All categories' : c, count: count('category', c, 'type', kind) }))
  const typeOptions = ['All', ...types].map((t) => ({ value: t, label: t === 'All' ? 'All types' : t, count: count('type', t, 'category', filter) }))
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
        {(categories.length > 1 || types.length > 1) && (
          <div className="shop-filters">
            {types.length > 1 && <FilterMenu label="Type" value={kind} options={typeOptions} onChange={chooseKind} />}
            {categories.length > 1 && <FilterMenu label="Category" value={filter} options={subjectOptions} onChange={choose} />}
            {(filter !== 'All' || kind !== 'All') && <button type="button" className="shop-filters-clear" onClick={() => { choose('All'); chooseKind('All') }}>Clear</button>}
            <span className="shop-filters-count">{shown.length} {shown.length === 1 ? 'piece' : 'pieces'}</span>
          </div>
        )}
      </header>

      <section className="section tight">
        <div className="container">
          {shown.length === 0 && <p className="shop-empty">Nothing here yet in that combination. <button type="button" onClick={() => { choose('All'); chooseKind('All') }}>Show everything</button></p>}
          <motion.ul className="grid" layout>
            <AnimatePresence mode="popLayout" initial={false}>
              {shown.map((p, i) => (
                <motion.li key={p.slug} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                  <button type="button" className="tile" onClick={() => setSel(i)}>
                    <TileBody p={p} eager={i < 4} />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </div>
      </section>

      {shows('shop', 'redraws') && redraws.length > 0 && filter === 'All' && kind === 'All' && (
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
