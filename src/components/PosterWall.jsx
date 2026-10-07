import Poster from './Poster'

const COLUMNS = ['left', 'middle', 'right']

/* The hero's wall of posters: three leaning columns that drift past each other for ever.
   Each column holds its posters twice, so the loop has no seam. Pointing at a poster stops the
   wall; a click opens it.
   A picture can be pinned to a column in the admin; the rest go, in order, to whichever column
   is shortest so far. `speed` is a percentage: 200 drifts twice as fast as 100. */
export default function PosterWall({ pieces, onOpen, speed = 100 }) {
  if (!pieces.length) return null
  const columns = [[], [], []]
  pieces.forEach((p, i) => { const fixed = COLUMNS.indexOf(p.column); if (fixed >= 0) columns[fixed].push({ p, i }) })
  pieces.forEach((p, i) => {
    if (COLUMNS.includes(p.column)) return
    const shortest = columns.reduce((best, col, c) => (col.length < columns[best].length ? c : best), 0)
    columns[shortest].push({ p, i })
  })
  for (const col of columns) col.sort((a, b) => a.i - b.i) // each column keeps the admin's order, top to bottom
  const pace = 100 / Math.min(300, Math.max(25, Number(speed) || 100))
  return (
    <div className="wall">
      <div className="wall-tilt">
        {columns.map((col, c) => col.length > 0 && (
          <div className="wall-col" key={c} style={{ '--speed': `${col.length * (c === 1 ? 11 : 14) * pace}s` }} data-dir={c === 1 ? 'down' : 'up'}>
            <div className="wall-track">
              {[...col, ...col].map(({ p, i }, n) => (
                <button key={n} type="button" className="wall-item" tabIndex={n < col.length ? 0 : -1} aria-hidden={n < col.length ? undefined : true} aria-label={`Open ${p.title || 'picture'}`} onClick={() => onOpen(i)}>
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
