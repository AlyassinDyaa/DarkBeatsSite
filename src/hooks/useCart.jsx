import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { canBuy, nowPrice, shop, work } from '../data/site'

/* The cart. What a visitor has added is kept in their browser (so it survives a reload), as
   { slug, signed, qty } lines. Every time it is read it is checked against the site's content:
   a piece that has sold out, been hidden or lost its price drops out, and prices always come
   from the content, never from what was stored. The checkout reads the prices again itself. */
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

  const lines = useMemo(() => raw.map((l) => {
    const piece = work.find((p) => p.slug === l.slug)
    if (!piece || !canBuy(piece)) return null
    const signed = Boolean(shop.signedChoice && l.signed)
    const each = nowPrice(piece) + (signed ? Math.max(0, Number(shop.signedExtra) || 0) : 0)
    return { key: `${l.slug}:${signed ? 's' : 'u'}`, slug: l.slug, signed, qty: clamp(l.qty), piece, each }
  }).filter(Boolean), [raw])

  const same = (l, slug, signed) => l.slug === slug && Boolean(l.signed) === Boolean(signed)
  const add = useCallback((slug, signed = false) => setRaw((r) => {
    const i = r.findIndex((l) => same(l, slug, signed))
    if (i < 0) return [...r, { slug, signed: Boolean(signed), qty: 1 }]
    const next = [...r]; next[i] = { ...next[i], qty: clamp(next[i].qty + 1) }; return next
  }), [])
  const setQty = useCallback((slug, signed, qty) => setRaw((r) => r.map((l) => (same(l, slug, signed) ? { ...l, qty: clamp(qty) } : l))), [])
  const remove = useCallback((slug, signed) => setRaw((r) => r.filter((l) => !same(l, slug, signed))), [])
  const clear = useCallback(() => setRaw([]), [])

  const count = lines.reduce((n, l) => n + l.qty, 0)
  const total = lines.reduce((n, l) => n + l.qty * l.each, 0)
  const value = { lines, count, total, add, setQty, remove, clear, open, setOpen, max: MAX_QTY }
  return <Cart.Provider value={value}>{children}</Cart.Provider>
}

export const useCart = () => useContext(Cart)
