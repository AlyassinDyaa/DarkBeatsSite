import { useRef, useState } from 'react'
import { asset } from '../data/site'
import { useMedia } from '../hooks/useMedia'
import Reveal from './Reveal'
import Lightbox from './Lightbox'

function Shot({ g, eager }) {
  // Until the file arrives, CSS holds a portrait slot open so the layout does not collapse and jump.
  const [loaded, setLoaded] = useState(false)
  return <img className={loaded ? undefined : 'pending'} src={asset(g.src)} alt={g.title || ''} loading={eager ? 'eager' : 'lazy'} draggable="false" onLoad={() => setLoaded(true)} />
}

/* Strip: one row of tall pictures that scrolls sideways (swipe, trackpad, the scrollbar, or the
   two arrow buttons, which move it most of a screen at a time). */
function Strip({ items, open }) {
  const row = useRef(null)
  const slide = (way) => row.current?.scrollBy({ left: way * row.current.clientWidth * 0.8, behavior: 'smooth' })
  return (
    <div className="strip-wrap">
      <ul className="strip" ref={row} data-lenis-prevent-touch>
        {items.map((g, i) => (
          <li key={`${g.src}-${i}`}>
            <button type="button" className="shot" onClick={() => open(i)} aria-label={`Open ${g.title || 'picture'}`}>
              <Shot g={g} eager={i < 4} />
              {g.title && <span className="shot-cap">{g.title}</span>}
            </button>
          </li>
        ))}
      </ul>
      {items.length > 2 && (
        <>
          <button type="button" className="strip-nav prev" onClick={() => slide(-1)} aria-label="Earlier pictures">←</button>
          <button type="button" className="strip-nav next" onClick={() => slide(1)} aria-label="More pictures">→</button>
        </>
      )}
    </div>
  )
}

/* Spotlight: one picture large, with its title and the rest of the set beside it. Pointing at (or
   tabbing to) a small picture puts it in the big frame; a click on the big picture opens it. */
function Spotlight({ items, open }) {
  const [at, setAt] = useState(0)
  const cur = items[Math.min(at, items.length - 1)]
  const i = items.indexOf(cur)
  return (
    <div className="spot">
      <button type="button" className="shot spot-main" onClick={() => open(i)} aria-label={`Open ${cur.title || 'picture'}`}>
        <Shot key={cur.src} g={cur} eager />
      </button>
      <div className="spot-side">
        <div className="label accent">{i + 1} / {items.length}</div>
        {cur.title && <h3 className="display h-md">{cur.title}</h3>}
        {cur.note && <p className="dim">{cur.note}</p>}
        <ul className="spot-thumbs">
          {items.map((g, n) => (
            <li key={`${g.src}-${n}`}>
              <button type="button" className={n === i ? 'on' : ''} aria-label={`Show ${g.title || 'picture'}`} aria-pressed={n === i} onMouseEnter={() => setAt(n)} onFocus={() => setAt(n)} onClick={() => setAt(n)}>
                <Shot g={g} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* A set of pictures in one of four layouts (hooks/useGalleryView.js): wall (columns, each
   picture at its own proportions), grid (even tiles), strip (one sideways row) or spotlight.
   In every layout a click opens the picture large, and from there the whole set can be browsed. */
export default function GalleryGrid({ items, view = 'wall' }) {
  const [sel, setSel] = useState(null)
  const tiles = view === 'grid'
  // The wall: four columns on a wide screen, three on a middling one, two on a phone. The
  // pictures are dealt out across the columns in turn, so they read left to right in the order
  // the artist put them in and no column is left empty when there are only a few.
  const wide = useMedia('(min-width: 1200px)'), mid = useMedia('(min-width: 700px)')
  const count = wide ? 4 : mid ? 3 : 2
  const columns = Array.from({ length: count }, (_, c) => items.map((g, i) => ({ g, i })).filter((x) => x.i % count === c))
  const shot = (g, i) => (
    <Reveal as="li" key={`${g.src}-${i}`} delay={Math.min(i, 8) * 0.05} y={20}>
      <button type="button" className="shot" onClick={() => setSel(i)} aria-label={`Open ${g.title || 'picture'}`}>
        <Shot g={g} eager={i < 4} />
        {g.title && <span className="shot-cap">{g.title}</span>}
      </button>
    </Reveal>
  )
  return (
    <>
      {view === 'strip' && <Strip items={items} open={setSel} />}
      {view === 'spotlight' && <Spotlight items={items} open={setSel} />}
      {tiles && <ul className="tiles">{items.map(shot)}</ul>}
      {view !== 'strip' && view !== 'spotlight' && !tiles && (
        <div className="masonry" style={{ '--columns': count }}>
          {columns.map((column, c) => <ul key={c}>{column.map(({ g, i }) => shot(g, i))}</ul>)}
        </div>
      )}
      <Lightbox items={items} sel={sel} setSel={setSel} />
    </>
  )
}
