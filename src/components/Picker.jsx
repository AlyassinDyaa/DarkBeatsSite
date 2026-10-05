import { useEffect, useId, useRef, useState } from 'react'

/* A drop-down drawn by the site itself. A plain <select> hands the list over to the phone, which
   shows its own menu wherever it likes (on an iPhone: floating over the fields above). This one
   opens directly under its box, in the site's colours, and behaves the same everywhere.
   Works with the keyboard (arrows, Enter, Escape) and sends its value with the form. */
export default function Picker({ label, name, options }) {
  const id = useId()
  const box = useRef(null)
  const [value, setValue] = useState(options[0])
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0) // the option the keyboard or pointer is on

  // a press anywhere else closes the list
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const show = () => { setAt(Math.max(0, options.indexOf(value))); setOpen(true) }
  const choose = (option) => { setValue(option); setOpen(false) }
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
    <div ref={box} className={`field pick ${open ? 'is-open' : ''}`}>
      <span className="pick-label" id={`${id}-label`}>{label}</span>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="pick-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open ? `${id}-${at}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={keys}
      >
        <span id={`${id}-value`}>{value}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>
      </button>
      {open && (
        <ul className="pick-list" role="listbox" aria-labelledby={`${id}-label`}>
          {options.map((option, i) => (
            <li
              key={option}
              id={`${id}-${i}`}
              role="option"
              aria-selected={option === value}
              className={i === at ? 'on' : ''}
              onPointerEnter={() => setAt(i)}
              onClick={() => choose(option)}
            >
              {option}
              {option === value && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" /></svg>}
            </li>
          ))}
        </ul>
      )}
      <span className="bar" />
    </div>
  )
}
