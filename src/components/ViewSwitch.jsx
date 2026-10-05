import { VIEWS } from '../hooks/useGalleryView'

/* The row of four buttons that switches how a set of pictures is laid out. */
export default function ViewSwitch({ view, onChange }) {
  return (
    <div className="views" role="group" aria-label="How to show the pictures">
      {VIEWS.map((v) => (
        <button key={v.id} type="button" title={v.label} aria-label={v.label} aria-pressed={view === v.id} onClick={() => onChange(v.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d={v.icon} /></svg>
        </button>
      ))}
    </div>
  )
}
