import { useState } from 'react'
import Poster from './Poster'

/* Then and now: two drawings of the same subject on top of each other, with a line you drag
   across to wipe from the old one to the new one. A set with more than two stages gets a row of
   years to choose which older drawing sits on the "then" side; "now" is always the newest.
   The dragging is a real range input laid over the pictures, so it also works with the arrow
   keys and with a screen reader. */
export default function Compare({ set, seed = 0 }) {
  const stages = set.stages
  const now = stages[stages.length - 1]
  const older = stages.slice(0, -1)
  const [pick, setPick] = useState(older.length - 1)
  const [pos, setPos] = useState(50)
  const then = older[Math.min(pick, older.length - 1)]
  return (
    <figure className="compare" style={{ '--pos': `${pos}%` }}>
      <div className="compare-stage">
        <Poster title={set.title} hue={set.hue} src={now.src} seed={seed} />
        <div className="compare-then">
          <Poster title={set.title} hue={set.hue} src={then.src} seed={seed} rough />
        </div>
        <span className="compare-year then">{then.year}</span>
        <span className="compare-year now">{now.year}</span>
        <span className="compare-line" aria-hidden="true"><i>↔</i></span>
        <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label={`${set.title}: wipe between ${then.year} and ${now.year}`} />
      </div>
      <figcaption>
        <div>
          <h3 className="display h-sm">{set.title}</h3>
          {set.text && <p className="dim">{set.text}</p>}
        </div>
        {older.length > 1 && (
          <div className="compare-picks" role="group" aria-label="Compare with">
            {older.map((s, i) => <button key={s.year} type="button" className={`chip ${i === pick ? 'on' : ''}`} aria-pressed={i === pick} onClick={() => setPick(i)}>{s.year}</button>)}
            <span className="chip is-fixed">vs {now.year}</span>
          </div>
        )}
      </figcaption>
    </figure>
  )
}
