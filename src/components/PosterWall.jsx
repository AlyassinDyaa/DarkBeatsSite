import Poster from './Poster'

/* The hero's wall of posters: three leaning columns that drift past each other for ever.
   Each column holds its posters twice, so the loop has no seam. Pointing at a poster stops the
   wall; a click opens it. */
export default function PosterWall({ pieces, onOpen }) {
  if (!pieces.length) return null
  // deal the pieces out over three columns, keeping each piece's place in the full list
  const columns = [0, 1, 2].map((c) => pieces.map((p, i) => ({ p, i })).filter((x) => x.i % 3 === c))
  return (
    <div className="wall">
      <div className="wall-tilt">
        {columns.map((col, c) => col.length > 0 && (
          <div className="wall-col" key={c} style={{ '--speed': `${col.length * (c === 1 ? 11 : 14)}s` }} data-dir={c === 1 ? 'down' : 'up'}>
            <div className="wall-track">
              {[...col, ...col].map(({ p, i }, n) => (
                <button key={n} type="button" className="wall-item" tabIndex={n < col.length ? 0 : -1} aria-hidden={n < col.length ? undefined : true} aria-label={`Open ${p.title}`} onClick={() => onOpen(i)}>
                  <Poster title={p.title} hue={p.hue} src={p.src} seed={i} eager={n < 2} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
