import Poster from './Poster'

const COLUMNS = ['left', 'middle', 'right']

/* The hero's wall of posters: three leaning columns that drift past each other for ever.
   Each column holds its posters twice, so the loop has no seam. Pointing at a poster stops the
   wall; a click opens it.
   A picture can be pinned to a column in the admin; the rest go, in order, to whichever column
   is shortest so far. `speed` is a percentage: 200 drifts twice as fast as 100.
   With fewer than nine pictures they repeat until there are nine, so every column is full; the
   repeats are only for the eye (screen readers and the Tab key meet each picture once). */
const FULL = 9
export default function PosterWall({ pieces, onOpen, speed = 100 }) {
  if (!pieces.length) return null
  const shown = pieces.map((p, i) => ({ p, i, at: i }))
  // each round of repeats starts one picture later when the count is a multiple of three, or every
  // column would hold the same picture over and over
  for (let round = 1; shown.length < FULL; round++) {
    for (let k = 0; k < pieces.length && shown.length < FULL; k++) {
      const i = (k + (pieces.length % 3 === 0 ? round : 0)) % pieces.length
      shown.push({ p: pieces[i], i, at: shown.length, copy: true })
    }
  }
  const columns = [[], [], []]
  shown.forEach((s) => { const fixed = COLUMNS.indexOf(s.p.column); if (fixed >= 0) columns[fixed].push(s) })
  shown.forEach((s) => {
    if (COLUMNS.includes(s.p.column)) return
    const shortest = columns.reduce((best, col, c) => (col.length < columns[best].length ? c : best), 0)
    columns[shortest].push(s)
  })
  for (const col of columns) col.sort((a, b) => a.at - b.at) // each column keeps the admin's order, top to bottom
  const pace = 100 / Math.min(300, Math.max(25, Number(speed) || 100))
  return (
    <div className="wall">
      <div className="wall-tilt">
        {columns.map((col, c) => col.length > 0 && (
          <div className="wall-col" key={c} style={{ '--speed': `${col.length * (c === 1 ? 11 : 14) * pace}s` }} data-dir={c === 1 ? 'down' : 'up'}>
            <div className="wall-track">
              {[...col, ...col].map(({ p, i, copy }, n) => (
                <button key={n} type="button" className="wall-item" tabIndex={n < col.length && !copy ? 0 : -1} aria-hidden={n < col.length && !copy ? undefined : true} aria-label={`Open ${p.title || 'picture'}`} onClick={() => onOpen(i)}>
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
