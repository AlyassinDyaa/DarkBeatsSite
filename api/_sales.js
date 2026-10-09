/* Shop-wide sales, set in the admin under Shop → Sales (content/site/sales.json): a percentage off
   everything, or off one category (Heroes, Villains...), one type (Posters, Stickers...) or one
   universe (DC, Marvel...), switched on and off by hand or by dates.

   The site (src/data/site.js) and the checkout (api/checkout.js) both price with this file, so the
   price a buyer sees is the price Stripe or PayPal charges. Discounts never add up: a piece costs
   the lowest of its usual price, its own sale price (status "On sale") and each sale that covers
   it. A discount code still comes off the total on top.

   Plain JavaScript with no imports, so the browser and the server can both load it. */

// The days a sale starts and ends are the artist's days (Gold Coast; no daylight saving there).
export const SALE_ZONE = 'Australia/Brisbane'
export const today = (at = new Date()) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: SALE_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at) } catch { return at.toISOString().slice(0, 10) }
}
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '')
const COVERS = ['all', 'category', 'type', 'universe']

// the admin's list, tidied: { name, on, covers, group, percent, starts, ends }
export const tidySales = (list) => (Array.isArray(list) ? list : []).filter((s) => s && typeof s === 'object').map((s) => {
  const covers = COVERS.includes(s.covers) ? s.covers : 'all'
  return {
    name: String(s.name || '').trim().slice(0, 60),
    on: s.on !== false,
    covers,
    group: covers === 'all' ? '' : String(s[covers] || '').trim(),
    percent: Math.round(Number(s.percent) || 0),
    starts: day(s.starts),
    ends: day(s.ends),
  }
})

// the sales running now: switched on, a sensible percentage, inside their dates (both days included)
export const liveSales = (list, at) => {
  const d = today(at)
  return tidySales(list).filter((s) => s.on && s.percent >= 1 && s.percent <= 90 && (s.covers === 'all' || s.group) && (!s.starts || s.starts <= d) && (!s.ends || d <= s.ends))
}

// the running sales that cover one piece
export const salesFor = (piece, live) => (live || []).filter((s) => s.covers === 'all' || String((piece && piece[s.covers]) || '').trim() === s.group)

/* One way of buying a piece: its usual price, and its own sale price (0 when it is not on sale).
   Answers { now, by }: the lowest price, and what gave it (null: the usual price; { kind: 'own' };
   or { kind: 'sale', name, percent, ends }). Worked out in cents, rounded as Stripe rounds. */
export const bestPrice = (usual, own, piece, live) => {
  const u = Math.round(Number(usual) * 100)
  if (!(u > 0)) return { now: Number(usual) || 0, by: null }
  let now = u
  let by = null
  const o = Math.round(Number(own) * 100)
  if (o > 0 && o < u) { now = o; by = { kind: 'own' } }
  for (const s of salesFor(piece, live)) {
    const c = Math.round((u * (100 - s.percent)) / 100)
    if (c < now) { now = c; by = { kind: 'sale', name: s.name, percent: s.percent, ends: s.ends } }
  }
  return { now: now / 100, by }
}
