import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { brand } from '../data/site'

/* Wraps every route: scrolls to top, sets the title, animates in/out. */
export default function Page({ title, children, className = '' }) {
  useEffect(() => {
    document.title = title ? `${title} — ${brand.name}` : `${brand.name} — ${brand.tagline}`
    if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }, [title])
  return (
    <motion.main className={`page ${className}`} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.45, delay: 0.3 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      {children}
    </motion.main>
  )
}
