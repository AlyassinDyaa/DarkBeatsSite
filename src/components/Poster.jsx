import { useState } from 'react'
import { asset } from '../data/site'

/* One piece of art at poster proportions. With a picture it shows the picture. Until a picture
   has been uploaded it draws a title card in the piece's own colour (its "hue"), so the site never has holes:
   one of four backdrops (rings, rays, dots, streaks), picked by `seed`. `rough` greys the card
   out, for the "then" side of a then-and-now pair. */
export default function Poster({ title, hue = 312, src, seed = 0, rough = false, eager = false, className = '' }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={`poster ${rough ? 'is-rough' : ''} ${className}`} style={{ '--ph': hue }}>
      {src ? (
        <img className={loaded ? undefined : 'pending'} src={asset(src)} alt={title} loading={eager ? 'eager' : 'lazy'} draggable="false" onLoad={() => setLoaded(true)} />
      ) : (
        <div className="poster-gen" data-v={Math.abs(seed) % 4} role="img" aria-label={title}>
          <span className="poster-title">{title}</span>
        </div>
      )}
    </div>
  )
}
