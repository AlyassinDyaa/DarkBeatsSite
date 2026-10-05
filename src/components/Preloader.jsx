import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { brand } from '../data/site'
import { useReducedMotion } from '../hooks/useMedia'
import Wordmark from './Wordmark'

/* A short opening card: the name, then three slanted strokes pull away to show the site. */
export default function Preloader({ onDone }) {
  const reduced = useReducedMotion()
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), reduced ? 0 : 900)
    return () => clearTimeout(t)
  }, [reduced])
  return (
    <AnimatePresence onExitComplete={onDone}>
      {show && (
        <motion.div className="preloader" exit={{ opacity: 1, transition: { duration: reduced ? 0 : 0.7 } }} aria-label={`${brand.name} is loading`}>
          {[0, 1, 2].map((i) => (
            <motion.i key={i} className="preloader-stroke" style={{ left: `${i * 33.34}%` }} exit={{ y: i % 2 ? '100%' : '-100%' }} transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : i * 0.06, ease: [0.76, 0, 0.24, 1] }} />
          ))}
          <motion.div className="preloader-mark" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.4 }}>
            <Wordmark />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
