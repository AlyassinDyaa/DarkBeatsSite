import { useEffect, useRef, useState } from 'react'
import { brand, nameParts } from '../data/site'
import { useReducedMotion } from '../hooks/useMedia'

/* The opening card: the name rises into place over a bar that fills, then the card is wiped off
   to the right along a slanted edge, with a slab of the brand colour chasing it.
   The whole sequence is plain CSS (see .preloader in components.css) and ends with the card
   hidden, so it cannot get stuck on screen; the timers here only tell the site when the wipe
   starts and take the card out of the page once it is over. */
const WIPE_AT = 1250 // ms: the same moment the CSS starts the wipe
const OVER_AT = 2200

export default function Preloader({ onDone }) {
  const reduced = useReducedMotion()
  const [over, setOver] = useState(false)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    const start = setTimeout(() => done.current?.(), reduced ? 0 : WIPE_AT)
    const end = setTimeout(() => setOver(true), reduced ? 0 : OVER_AT)
    return () => { clearTimeout(start); clearTimeout(end) }
  }, [reduced])
  if (over || reduced) return null
  const [a, b] = nameParts(brand.name)
  return (
    <>
      <i className="preloader-slab" aria-hidden="true" />
      <div className="preloader" role="status" aria-label={`${brand.name} is loading`}>
        <div className="preloader-name" aria-hidden="true">
          <span><b>{a}</b></span>
          {b && <span><b className="is-accent">{b}</b></span>}
        </div>
        <div className="preloader-bar" aria-hidden="true"><i /></div>
        {brand.tagline && <div className="preloader-tag" aria-hidden="true">{brand.tagline}</div>}
      </div>
    </>
  )
}
