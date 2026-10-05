import { motion } from 'framer-motion'
import { useReducedMotion } from '../hooks/useMedia'

/* The slanted band of words under the hero. */
export default function Marquee({ items, speed = 30 }) {
  const reduced = useReducedMotion()
  if (!items.length) return null
  const row = [...items, ...items, ...items, ...items]
  return (
    <div className="band" aria-hidden="true">
      <motion.div className="band-track" animate={reduced ? {} : { x: ['0%', '-50%'] }} transition={{ duration: speed, ease: 'linear', repeat: Infinity }}>
        {row.map((t, i) => <span className="band-item" key={i}>{t}</span>)}
      </motion.div>
    </div>
  )
}
