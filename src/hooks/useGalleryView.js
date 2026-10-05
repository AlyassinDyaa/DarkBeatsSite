import { useState } from 'react'
import { home } from '../data/site'

/* The four ways a set of pictures can be laid out. The artist picks which one visitors see first
   (Home page → Gallery in the admin); a visitor's own choice is remembered in their browser and
   used wherever pictures are shown. */
export const VIEWS = [
  { id: 'wall', label: 'Wall', icon: 'M4 4h7v9H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 15h7v5H4z' },
  { id: 'grid', label: 'Grid', icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z' },
  { id: 'strip', label: 'Strip', icon: 'M3 6h5v12H3z M9.500 6h5v12h-5z M16 6h5v12h-5z' },
  { id: 'spotlight', label: 'Spotlight', icon: 'M4 4h10v16H4z M16 4h4v4h-4z M16 10h4v4h-4z M16 16h4v4h-4z' },
]
const KEY = 'db.galleryView'
const known = (id) => VIEWS.some((v) => v.id === id)

export function useGalleryView() {
  const [view, setView] = useState(() => {
    let saved = null
    try { saved = localStorage.getItem(KEY) } catch { /* storage switched off: use the artist's choice */ }
    return known(saved) ? saved : known(home.galleryView) ? home.galleryView : 'wall'
  })
  const choose = (id) => {
    setView(id)
    try { localStorage.setItem(KEY, id) } catch { /* not remembered, still applied */ }
  }
  return [view, choose]
}
