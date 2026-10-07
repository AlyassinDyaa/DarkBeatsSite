import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { canBuy, nowPrice, shop, sizesOf, work } from '../data/site'
import { useAccount } from './useAccount'

/* The cart. What a visitor has added is kept in their browser (so it survives a reload), as
   { slug, size, signed, qty } lines. Every time it is read it is checked against the site's content:
   a piece that has sold out, been hidden or lost its price drops out, and prices always come
   from the content, never from what was stored. The checkout reads the prices again itself.
   With a customer logged in, the cart is the account's: it arrives with the login (joined with
   whatever was added before logging in), every change is saved to the account, and logging out
   empties it on this device. */
const KEY = 'jb.cart'
const MAX_QTY = 10
const Cart = createContext(null)
const clamp = (n) => Math.min(MAX_QTY, Math.max(1, Math.round(Number(n) || 1)))
const load = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((l) => l && typeof l.slug === 'string') : [] } catch { return [] }
}

export function CartProvider({ children }) {
  const [raw, setRaw] = useState(load)
  const [open, setOpen] = useState(false)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(raw)) } catch { /* not kept: the cart still works for this visit */ } }, [raw])

  const account = useAccount()
  const who = account.user ? account.user.email : ''
  const owner = useRef(null) // whose cart this is now
  const fromAccount = account.user ? account.user.cart : null
  useEffect(() => {
    if (!account.ready) return
    if (who && owner.current !== who) { owner.current = who; setRaw(Array.isArray(fromAccount) ? fromAccount : []) }
    else if (!who && owner.current) { owner.current = null; setRaw([]) }
  }, [who, account.ready]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = account.call
  useEffect(() => {
    if (!who || owner.current !== who) return
    const t = setTimeout(() => { save('cart', { cart: raw }).catch(() => { /* kept on this device; saved with the next change */ }) }, 700)
    return () => clearTimeout(t)
  }, [raw, who, save])

  const lines = useMemo(() => raw.map((l) => {
    const piece = work.find((p) => p.slug === l.slug)
    if (!piece || !canBuy(piece)) return null
    // a size the piece no longer comes in (or a line from before it had sizes) drops out
    const sizes = sizesOf(piece)
    const size = sizes.length ? (sizes.some((s) => s.name === l.size) ? l.size : null) : ''
    if (size === null) return null
    const signed = Boolean(shop.signedChoice && l.signed)
    const each = nowPrice(piece, size || undefined) + (signed ? Math.max(0, Number(shop.signedExtra) || 0) : 0)
    return { key: `${l.slug}:${size}:${signed ? 's' : 'u'}`, slug: l.slug, size, signed, qty: clamp(l.qty), piece, each }
  }).filter(Boolean), [raw])

  const same = (l, slug, signed, size) => l.slug === slug && Boolean(l.signed) === Boolean(signed) && (l.size || '') === (size || '')
  const add = useCallback((slug, signed = false, size = '') => setRaw((r) => {
    const i = r.findIndex((l) => same(l, slug, signed, size))
    if (i < 0) return [...r, { slug, size: size || '', signed: Boolean(signed), qty: 1 }]
    const next = [...r]; next[i] = { ...next[i], qty: clamp(next[i].qty + 1) }; return next
  }), [])
  const setQty = useCallback((slug, signed, size, qty) => setRaw((r) => r.map((l) => (same(l, slug, signed, size) ? { ...l, qty: clamp(qty) } : l))), [])
  const remove = useCallback((slug, signed, size) => setRaw((r) => r.filter((l) => !same(l, slug, signed, size))), [])
  const clear = useCallback(() => setRaw([]), [])

  const count = lines.reduce((n, l) => n + l.qty, 0)
  const total = lines.reduce((n, l) => n + l.qty * l.each, 0)
  const value = { lines, count, total, add, setQty, remove, clear, open, setOpen, max: MAX_QTY, stored: raw }
  return <Cart.Provider value={value}>{children}</Cart.Provider>
}

export const useCart = () => useContext(Cart)
