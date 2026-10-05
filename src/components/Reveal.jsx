import { motion } from 'framer-motion'

/* Fade-and-rise when scrolled into view. */
export default function Reveal({ children, delay = 0, y = 32, className = '', once = true, style, as = 'div' }) {
  const M = motion[as] || motion.div
  return (
    <M
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-8% 0px' }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </M>
  )
}
