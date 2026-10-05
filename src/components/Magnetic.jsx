import { useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useFinePointer, useReducedMotion } from '../hooks/useMedia'

/* Pulls its child toward the pointer while hovered. */
export default function Magnetic({ children, strength = 0.35, className = '' }) {
  const ref = useRef(null)
  const x = useMotionValue(0), y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 180, damping: 16, mass: 0.4 })
  const sy = useSpring(y, { stiffness: 180, damping: 16, mass: 0.4 })
  const fine = useFinePointer(), reduced = useReducedMotion()
  const on = fine && !reduced
  const move = (e) => {
    if (!on) return
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - (r.left + r.width / 2)) * strength)
    y.set((e.clientY - (r.top + r.height / 2)) * strength)
  }
  const leave = () => { x.set(0); y.set(0) }
  return (
    <motion.div ref={ref} className={`magnetic ${className}`} style={{ x: sx, y: sy, display: 'inline-block' }} onMouseMove={move} onMouseLeave={leave}>
      {children}
    </motion.div>
  )
}
