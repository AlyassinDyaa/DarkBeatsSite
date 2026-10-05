import { useEffect } from 'react'
import Lenis from 'lenis'

/* Smooth, inertial scrolling. Skipped when the user prefers reduced motion. */
export function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true })
    window.__lenis = lenis
    let raf
    const loop = (t) => { lenis.raf(t); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); lenis.destroy(); window.__lenis = null }
  }, [enabled])
}
