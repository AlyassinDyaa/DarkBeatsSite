import { useState } from 'react'
import { asset } from '../data/site'
import Reveal from './Reveal'
import Lightbox from './Lightbox'

function Shot({ g, eager }) {
  // Until the file arrives, CSS holds a portrait slot open so the columns do not collapse and jump.
  const [loaded, setLoaded] = useState(false)
  return <img className={loaded ? undefined : 'pending'} src={asset(g.src)} alt={g.title || ''} loading={eager ? 'eager' : 'lazy'} draggable="false" onLoad={() => setLoaded(true)} />
}

/* Pictures in columns, each at its own proportions (nothing is cropped), with its title under
   it. A click opens the picture large; from there the whole set can be browsed. */
export default function GalleryGrid({ items }) {
  const [sel, setSel] = useState(null)
  return (
    <>
      <ul className="masonry">
        {items.map((g, i) => (
          <Reveal as="li" key={`${g.src}-${i}`} delay={Math.min(i, 8) * 0.05} y={20}>
            <button type="button" className="shot" onClick={() => setSel(i)} aria-label={`Open ${g.title || 'picture'}`}>
              <Shot g={g} eager={i < 3} />
              {g.title && <span className="shot-cap">{g.title}</span>}
            </button>
          </Reveal>
        ))}
      </ul>
      <Lightbox items={items} sel={sel} setSel={setSel} />
    </>
  )
}
