import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from './hooks/useLenis'
import { applyBrandHue } from './hooks/useHue'
import { asset, brand, previewing, shows } from './data/site'
import { useReducedMotion } from './hooks/useMedia'
import Preloader from './components/Preloader'
import Nav from './components/Nav'
import Footer from './components/Footer'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Work from './pages/Work'
import Commissions from './pages/Commissions'
import About from './pages/About'
import Contact from './pages/Contact'
import Support from './pages/Support'
import NotFound from './pages/NotFound'

/* In the admin's live preview there is no opening card: the page is ready at once. */
function PreviewReady({ onReady }) {
  useEffect(() => { onReady() }, [onReady])
  return null
}

export default function App() {
  const loc = useLocation()
  const reduced = useReducedMotion()
  const [ready, setReady] = useState(false)
  useLenis(!reduced)
  useEffect(applyBrandHue, [])
  // what search engines and link previews say about the site: the blurb from "Name, colour and contact" in the admin
  useEffect(() => { if (brand.blurb) document.querySelector('meta[name="description"]')?.setAttribute('content', brand.blurb) }, [])
  // the browser tab icon chosen in the admin (the build already writes it into the page; this also
  // covers an admin looking at a change saved since the last build)
  useEffect(() => {
    if (!brand.icon) return
    for (const link of document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')) { link.href = asset(brand.icon); link.removeAttribute('type') }
  }, [])
  return (
    <>
      {new URLSearchParams(loc.search).get('preview') === 'hero' ? <PreviewReady onReady={() => setReady(true)} /> : <Preloader onDone={() => setReady(true)} />}
      <Nav />
      {/* A slanted slash of the current colour crosses the screen between routes
          (not on arrival: the opening card has just done that job) */}
      <AnimatePresence>
        {ready && !reduced && loc.key !== 'default' && (
          <motion.div key={loc.pathname} className="slash" style={{ skewX: -18 }} initial={{ x: '-130%' }} animate={{ x: '130%' }} transition={{ duration: 0.75, ease: [0.76, 0, 0.24, 1] }} />
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <Routes location={loc} key={loc.pathname}>
          <Route path="/" element={<Home />} />
          {/* a page the admin has hidden has no route, so its address shows "not found" */}
          {shows('pages', 'work') && <Route path="/shop" element={<Shop />} />}
          {shows('pages', 'gallery') && <Route path="/work" element={<Work />} />}
          {/* the Work page's first address */}
          <Route path="/gallery" element={<Navigate to="/work" replace />} />
          {shows('pages', 'commissions') && <Route path="/commissions" element={<Commissions />} />}
          {shows('pages', 'about') && <Route path="/about" element={<About />} />}
          {shows('pages', 'contact') && <Route path="/contact" element={<Contact />} />}
          {shows('pages', 'support') && <Route path="/support" element={<Support />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
      <Footer />
      {previewing && <div className="fresh-note" role="status">Admin view: showing your latest saved changes. Visitors see them in about a minute.</div>}
    </>
  )
}
