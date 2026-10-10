import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { asset, brand, commissions, nav, shop, shows, social } from '../data/site'
import Wordmark from './Wordmark'
import { useCart } from '../hooks/useCart'
import { useAccount } from '../hooks/useAccount'

function Status() {
  return <><i className={commissions.open ? 'on' : ''} />{commissions.open ? 'Commissions open' : 'Commissions closed'}</>
}

export default function Nav() {
  const cart = useCart()
  const account = useAccount()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    window.__lenis?.[open ? 'stop' : 'start']?.()
  }, [open])
  const hire = shows('pages', 'commissions')

  return (
    <>
      <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="container nav-bar">
          <Link to="/" className="brand" aria-label={`${brand.name} home`} onClick={() => setOpen(false)}>
            {brand.logo && <img className={`brand-logo is-${['circle', 'rounded', 'square', 'natural'].includes(brand.logoShape) ? brand.logoShape : 'circle'}`} src={asset(brand.logo)} alt="" style={{ '--logo-size-set': `${Math.min(64, Math.max(24, Number(brand.logoSize) || 42))}px` }} />}
            <Wordmark />
          </Link>
          <nav className="nav-links" aria-label="Main">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end className={({ isActive }) => `nav-link ${isActive ? 'on' : ''} ${n.to === '/support' ? 'is-support' : ''}`}>{n.label}</NavLink>)}
          </nav>
          {hire && <Link className="nav-status" to="/commissions"><Status /></Link>}
          {account.on && (
            <Link className={`nav-account ${account.user ? 'is-in' : ''}`} to={account.user ? '/account' : '/account/login'} onClick={() => setOpen(false)} aria-label={account.user ? 'Your account' : 'Log in'} title={account.user ? 'Your account' : 'Log in'}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4z M4 20.5c.8-3.6 4-5.8 8-5.8s7.2 2.2 8 5.8" /></svg>
            </Link>
          )}
          {shop.enabled && (
            <button type="button" className="nav-cart" onClick={() => { setOpen(false); cart.setOpen(true) }} aria-label={`Cart, ${cart.count} ${cart.count === 1 ? 'print' : 'prints'}`}>
              {shop.cartIcon === 'cart'
                ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 4h2.6l2.3 10.6a1.2 1.2 0 0 0 1.2.9h8.6a1.2 1.2 0 0 0 1.2-.9L20.5 8H6" /><circle cx="9.5" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></svg>
                : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8.5h14l-1.1 11.6a1.2 1.2 0 0 1-1.2 1.1H7.3a1.2 1.2 0 0 1-1.2-1.1z" /><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" /></svg>}
              {cart.count > 0 && <span key={cart.count} className="nav-cart-count">{cart.count}</span>}
            </button>
          )}
          <button className={`burger ${open ? 'open' : ''}`} aria-expanded={open} aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <span /><span />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div className="menu" initial={{ clipPath: 'polygon(0 0, 100% 0, 100% 0, 0 0)' }} animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }} exit={{ clipPath: 'polygon(0 0, 100% 0, 100% 0, 0 0)' }} transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}>
            <div className="container menu-inner">
              <nav aria-label="Menu">
                <span className="menu-kicker">Menu</span>
                {/* each page on its own row: its number, its name, an arrow; the page you are on in purple */}
                <ul className="menu-links">
                  {nav.map((n, i) => (
                    <motion.li key={n.to} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.04, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
                      <NavLink to={n.to} end onClick={() => setOpen(false)}>
                        <small aria-hidden="true">{String(i + 1).padStart(2, '0')}</small>
                        <span>{n.label}</span>
                        <i aria-hidden="true">→</i>
                      </NavLink>
                    </motion.li>
                  ))}
                </ul>
              </nav>
              <motion.div className="menu-foot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.4 }}>
                {account.on && (
                  <Link className="menu-account" to={account.user ? '/account' : '/account/login'} onClick={() => setOpen(false)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.500 20.500c.8-3.600 3.800-5.700 7.500-5.700s6.700 2.100 7.500 5.700" /></svg>
                    <span>{account.user ? 'Your account' : 'Log in or make an account'}</span>
                    <i aria-hidden="true">→</i>
                  </Link>
                )}
                {hire && <Link className="nav-status menu-status" to="/commissions" onClick={() => setOpen(false)}><Status /></Link>}
                {social.length > 0 && <ul className="menu-social">{social.map((s) => <li key={s.label}><a href={s.url} target="_blank" rel="noreferrer">{s.label} <span aria-hidden="true">↗</span></a></li>)}</ul>}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
