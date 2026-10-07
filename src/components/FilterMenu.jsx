import { useEffect, useId, useRef, useState } from 'react'

/* A drop-down filter: a button showing the current choice, and a list under it. Each choice can
   carry a count. Works with the mouse, a finger and the keyboard (arrows, Enter, Escape). */
export default function FilterMenu({ label, value, options, onChange }) {
  const id = useId()
  const box = useRef(null)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const current = options.find((o) => o.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const show = () => { setAt(Math.max(0, options.indexOf(current))); setOpen(true) }
  const choose = (o) => { onChange(o.value); setOpen(false) }
  const keys = (e) => {
    if (e.key === 'Escape' || e.key === 'Tab') return setOpen(false)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return show()
      setAt((at + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
    }
    if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(options[at]) }
  }

  return (
    <div ref={box} className={`fmenu ${open ? 'is-open' : ''} ${current.value !== options[0].value ? 'is-set' : ''}`}>
      <span className="fmenu-label" id={`${id}-l`}>{label}</span>
      <button type="button" className="fmenu-button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`} aria-activedescendant={open ? `${id}-${at}` : undefined} onClick={() => (open ? setOpen(false) : show())} onKeyDown={keys}>
        <span id={`${id}-v`}>{current.label}</span>
        {current.count != null && <small>{current.count}</small>}
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>
      </button>
      {open && (
        <ul className="fmenu-list" role="listbox" aria-labelledby={`${id}-l`}>
          {options.map((o, i) => (
            <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={o.value === current.value} className={`${i === at ? 'on' : ''} ${o.count === 0 ? 'is-empty' : ''}`} onPointerEnter={() => setAt(i)} onClick={() => choose(o)}>
              <span>{o.label}</span>
              {o.count != null && <small>{o.count}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
