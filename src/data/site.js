/* ---------------------------------------------------------------------
   Site content loader.
   All content lives in /content as JSON and is edited through the admin
   panel at /admin (or directly in the files). This module just loads it.

   The content is built into the site, so a change normally shows after the
   site has rebuilt (about a minute). For an admin who has just saved, the
   page first asks for whatever is newer than this build and lays it over
   the built-in content (showLatest, called from main.jsx before anything is
   drawn). That is why everything below is assembled by one function and
   exported as `let`: it can be put together a second time.
   --------------------------------------------------------------------- */

import { bestPrice, liveSales } from '../../api/_sales.js'

const files = import.meta.glob('../../content/**/*.json', { eager: true })
// keyed the way the repository names them: "content/work/venom.json"
const built = Object.fromEntries(Object.entries(files).map(([path, m]) => [path.replace('../../', ''), m.default ?? m]))

const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99)
const live = (list) => list.filter((x) => !x.hidden) // entries ticked "Hide from the site"

export let brand, hero, marquee, home, commissions, about, contact, social, footer
/* The words on a customer's account page (Page text → Customer account page). */
export let accountPage
/* Selling: whether online purchases are on, the currency, what a buyer gets. */
export let shop
/* Where the "Get a quote" buttons go (Page text → Commissions → The quote button): see assemble(). */
export let quote
/* The shop-wide sales running now (Shop → Sales in the admin; api/_sales.js prices with them). */
export let sales
/* The Support page: the artist's own project, and the ways to back it. */
export let support
/* Headings and introductions of the Work and Gallery pages. */
export let pages
export let nav
/* Every piece, newest first; the file name is the piece's id. They are shown on the Shop page.
   (The folders and the show/hide switches keep their first names: "work" is the Shop page and
   its pieces, "gallery" is the Work page and its sections.) */
export let work
/* The Shop’s two ways of sorting a piece, each a list the admin keeps (Shop categories): its
   subject (Heroes, Villains...) and its type (Posters, Stickers...). Only those that have at least
   one piece are listed, in the admin’s order; any a piece names that is not in the list follow. */
export let categories, types
/* The drifting wall of pictures in the home page's top: the pictures chosen for it in the admin, in
   their order, each either a Shop piece or a picture of its own; with none chosen, every Shop piece. */
export let heroWall
/* Home shows up to six: the pieces ticked "Show on the home page", or simply the newest six. */
export let latest
/* The gallery: the artist makes sections and adds pictures to each. A section can also pull in
   pieces from Work, so a finished piece only has to be uploaded once. */
export let gallerySections, gallery
/* Up to six pictures for the home page: the ones ticked there, then others the home page is not
   already showing in its list of latest pieces. */
export let galleryHome
/* Then-and-now sets: the same subject drawn again years later. */
export let redraws
export let events
/* True when the page is showing an admin their newest saved changes rather than only the built-in content. */
export let previewing = false

/* Hiding. "Show or hide" in the admin switches whole pages and home-page sections off
   (anything not listed there is shown), and every entry has its own "Hide from the site" switch. */
let visibility = {}
export const shows = (group, key) => visibility[group]?.[key] !== false

let newPictures = {} // pictures saved after this build: "/uploads/x.webp" -> the picture itself

/* A new order on every visit that holds still for the visit: the content is put together twice
   (as built, then with the admin's latest saves) and the wall must not jump in between. */
const visit = Math.random().toString(36).slice(2)
const hash = (text) => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const mixed = (list) => list.map((p) => [hash(visit + p.slug), p]).sort((a, b) => a[0] - b[0]).map(([, p]) => p)

/* Where a piece's picture sits when a buyer uses it as their round profile picture (set in the
   admin: "left,top,zoom" in percent). The face is usually near the top, hence 22% when not set. */
const parseFace = (v) => { const [x, y, z] = String(v || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n))); return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 22, zoom: Number.isFinite(z) && z >= 100 ? z : 100 } }
// where a card design's picture sits on the card: "x,y,zoom" from the admin (the middle, a little above, by default)
const parseCrop = (v) => { const [x, y, z] = String(v || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n))); return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 25, zoom: Number.isFinite(z) && z >= 100 ? z : 100 } }
/* the style that puts it there, on an <img> filling a round frame */
export const faceLook = (piece) => { const f = (piece && piece.face) || { x: 50, y: 22, zoom: 100 }; return { objectPosition: `${f.x}% ${f.y}%`, transform: `scale(${f.zoom / 100})`, transformOrigin: `${f.x}% ${f.y}%` } }

/* The sizes typed into the admin, tidied: each with a name and a price above nothing. */
const cleanSizes = (list) => (Array.isArray(list) ? list : [])
  .map((s) => ({ name: String((s && s.name) || '').trim(), price: Number(s && s.price), salePrice: Number(s && s.salePrice) || 0 }))
  .filter((s) => s.name && s.price > 0)

/* Leaves out anything not filled in, so the built-in wording below it shows through. */
const given = (fields) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null))

function assemble(content) {
  // the words on each page (content/pages) and what applies to the whole site (content/site)
  const page = (name) => content[`content/pages/${name}.json`] || {}
  const site = (name) => content[`content/site/${name}.json`] || {}
  const { social: links, footerLine, footerFine, ...name } = site('brand')
  const { kicker, text, primaryLabel, secondaryLabel, buttons, figure, wall, wallShow, wallCategory, wallUniverse, wallSpeed, wallAddNew, marquee: words, ...sections } = page('home')
  const lists = page('lists')
  // every file of one folder, each with the name of its file
  const folder = (name) => Object.entries(content)
    .filter(([path]) => path.startsWith(`content/${name}/`))
    .map(([path, data]) => ({ ...data, slug: path.split('/').pop().replace(/\.json$/, '') }))

  // Every piece of text has a built-in wording, so a content file that predates a field still works.
  visibility = site('visibility')
  brand = { name: 'JBeatsArt', hue: 312, ...name }
  hero = { figure: {}, wallSpeed: 100, ...given({ kicker, text, figure, wallSpeed }) }
  // The buttons under the name, chosen in the admin: up to three, each to one of the site's pages
  // (left out while that page is switched off) or to another address.
  const PAGES = { work: ['/work', 'gallery'], shop: ['/shop', 'work'], commissions: ['/commissions'], about: ['/about'], contact: ['/contact'], support: ['/support'] }
  const chosen = Array.isArray(buttons) ? buttons : [
    { label: primaryLabel || 'See the work', page: 'work', style: 'filled' },
    { label: secondaryLabel || 'Commission a piece', page: 'commissions', style: 'outline' },
  ]
  hero.buttons = chosen.map((b) => {
    if (!b || !String(b.label || '').trim()) return null
    const look = b.style === 'outline' ? 'outline' : 'filled'
    if (b.page === 'link') {
      const url = String(b.url || '').trim()
      return /^https?:\/\//i.test(url) ? { label: b.label, href: url, external: true, look } : null
    }
    const [to, key] = PAGES[b.page] || PAGES.work
    return shows('pages', key || to.slice(1)) ? { label: b.label, href: to, look } : null
  }).filter(Boolean).slice(0, 3)
  marquee = words || []
  home = {
    latestLabel: 'Fresh ink', latestTitle: 'Latest pieces',
    galleryLabel: 'The gallery', galleryTitle: 'Up on the wall', galleryView: 'wall',
    redrawLabel: 'Keep drawing', redrawTitle: 'Then and now',
    commissionsTitle: 'Get something drawn', commissionsButton: 'How it works',
    eventsLabel: 'In person', eventsTitle: 'Find me at',
    ...given(sections),
  }
  commissions = {
    title: 'Get something drawn', processLabel: 'The process', processTitle: 'How it works',
    requestLabel: 'Request', requestTitle: 'Tell me the idea',
    closedTitle: 'Closed for now', closedText: 'New requests are paused while I work through the queue. They open again here soon.',
    tiers: [], steps: [], notes: [],
    ...given(page('commissions')),
  }
  about = { paragraphs: [], facts: [], ...given(page('about')) }
  contact = { label: 'Say hello', title: 'Get in touch', topics: [], ...given(page('contact')) }
  accountPage = { noteTitle: 'A note from the artist', note: '', signature: '', collectionTitle: 'Your collection', savedTitle: 'Saved for later', rewardText: 'Confirm your email to unlock rewards only confirmed members get.', ...given(page('account')) }
  // the free profile pictures: each with its picture (an uploaded file, or one of the starter set)
  accountPage.icons = (Array.isArray(accountPage.icons) ? accountPage.icons : []).filter((i) => i && typeof i.picture === 'string' && i.picture).map((i) => ({ picture: i.picture, name: i.name || '', face: parseFace(i.face) }))
  // rewards (Shop → Rewards): profile pictures, membership card designs and discounts a customer
  // earns by confirming their email, by a number of orders, or by a number of prints collected
  const rw = page('rewards')
  const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  if (rw.rewardText) accountPage.rewardText = rw.rewardText
  // one list per kind (Profile pictures, Membership card designs, Discounts)
  accountPage.rewards = (Array.isArray(rw.pictures) ? rw.pictures : []).map((r) => ({ ...r, kind: 'picture' })).concat((Array.isArray(rw.cards) ? rw.cards : []).map((r) => ({ ...r, kind: 'card' })), (Array.isArray(rw.discounts) ? rw.discounts : []).map((r) => ({ ...r, kind: 'discount' })), Array.isArray(rw.rewards) ? rw.rewards : [])
    .filter((r) => r && !r.hidden && (r.kind === 'card' ? r.cardLook || r.cardArt : r.kind === 'discount' ? Number(r.percent) > 0 : typeof r.picture === 'string' && r.picture))
    .map((r) => {
      const by = ['verify', 'orders', 'pieces', 'commissions'].includes(r.earnedBy) ? r.earnedBy : 'verify'
      return { id: slug(r.name) || slug(r.picture), name: r.name || '', kind: ['card', 'discount'].includes(r.kind) ? r.kind : 'picture', earnedBy: by, count: by === 'verify' ? 0 : Math.max(1, Math.round(Number(r.count) || 1)), percent: Number(r.percent) || 0, days: Number(r.days) || 60, picture: r.picture || '', face: parseFace(r.face), cardLook: r.cardLook || 'art', cardArt: r.cardArt || '', cardBack: r.cardBack || '', cardCrop: parseCrop(r.cardCrop) }
    })
  // the pictures given on confirming the email (the confirmation page and email show these)
  accountPage.verifiedIcons = accountPage.rewards.filter((r) => r.kind === 'picture' && r.earnedBy === 'verify')
  pages = {
    work: { label: 'The work', title: 'Everything so far', ...given({ label: lists.workLabel, title: lists.workTitle, intro: lists.workIntro }) },
    gallery: { label: 'The gallery', title: 'Up on the wall', ...given({ label: lists.galleryLabel, title: lists.galleryTitle, intro: lists.galleryIntro }) },
  }
  support = {
    title: 'Support', primaryLabel: 'Support the project',
    aboutLabel: 'The project', aboutTitle: 'What it is', artLabel: 'Project art', artTitle: 'From the drawing board',
    supportLabel: 'Support', supportTitle: 'Back the project', customLabel: 'Choose your own amount',
    soonTitle: 'Support opens soon.', soonText: 'The payment page is being set up. Until then, say hello:',
    homeButton: 'Support the project',
    paragraphs: [], facts: [], art: [], tiers: [], notes: [],
    ...given(page('support')),
  }
  shop = {
    enabled: false, currency: 'aud', buttonLabel: 'Buy', shipping: true, pricePlace: 'corner', tagPlace: 'corner', signedChoice: false, signedExtra: 0, cartIcon: 'bag',
    thanksTitle: 'Thank you.', thanksText: 'Your order is in. A receipt is on its way to your email.',
    ...given(site('shop')),
  }
  sales = liveSales(site('sales').sales)
  social = links || []
  brand.instagram = social.find((s) => /instagram/i.test(s.label || ''))?.url
  /* Where the quote buttons go (Page text → Commissions → The quote button, `quoteVia`): 'site' (the
     request card on the Commissions page, with the offer picked), 'email' (an email to the address
     under Brand & contact), 'instagram', or 'link' (quoteUrl). A choice with nothing to go to (no
     email, no Instagram, no address) falls back to the site. `to(tier)` is where a button on that
     offer goes; `closed` is true when it would go to a request card that is closed. */
  const askedVia = String(commissions.quoteVia || (commissions.quoteUrl ? 'link' : 'site'))
  const via = askedVia === 'email' && brand.email ? 'email' : askedVia === 'instagram' && brand.instagram ? 'instagram' : askedVia === 'link' && /^(https?:|mailto:)/.test(String(commissions.quoteUrl || '')) ? 'link' : 'site'
  quote = {
    label: commissions.quoteLabel || 'Get a quote',
    via,
    external: via === 'instagram' || via === 'link',
    // nowhere to go: the request card is closed, or switched off (Show / hide → Commissions)
    closed: via === 'site' && (commissions.open === false || visibility?.commissions?.request === false),
    to: (tier = '') => (via === 'email' ? `mailto:${brand.email}?subject=${encodeURIComponent(tier ? `Commission: ${tier}` : 'Commission')}`
      : via === 'instagram' ? brand.instagram : via === 'link' ? commissions.quoteUrl
        : `/commissions${tier ? `?kind=${encodeURIComponent(tier)}` : ''}#request`),
  }
  footer = { fine: 'Characters shown in fan art belong to their owners.', ...given({ line: footerLine, fine: footerFine }) }

  nav = [
    { label: 'Home', to: '/' },
    { label: 'Shop', to: '/shop', key: 'work' },
    { label: 'Work', to: '/work', key: 'gallery' },
    { label: 'Commissions', to: '/commissions' },
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' },
    { label: 'Support', to: '/support' },
  ].filter((n) => n.to === '/' || shows('pages', n.key || n.to.slice(1)))

  work = live(folder('work'))
    .filter((p) => p.title)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const shopLists = site('categories')
  const names = (list) => (Array.isArray(list) ? list : []).map((x) => String((x && x.name) || x || '').trim()).filter(Boolean)
  const inUse = (listed, field) => {
    const used = new Set(work.map((p) => p[field]).filter(Boolean))
    return [...names(listed).filter((n) => used.has(n)), ...[...used].filter((n) => !names(listed).includes(n))]
  }
  categories = inUse(shopLists.subjects, 'category')
  types = inUse(shopLists.types, 'type')
  // what the buyer gets: the line the admin wrote for the piece’s type, or the shop’s own line
  const typeNotes = Object.fromEntries((Array.isArray(shopLists.types) ? shopLists.types : []).filter((t) => t && t.name).map((t) => [String(t.name).trim(), String(t.note || '').trim()]))
  work = work.map((p) => ({ ...p, face: parseFace(p.face), sizes: cleanSizes(p.sizes), what: typeNotes[p.type] || shop.note || '' }))
  const picked = work.filter((p) => p.featured)
  latest = (picked.length ? picked : work).slice(0, 6)

  const placed = (Array.isArray(wall) ? wall : []).map((w) => {
    if (!w) return null
    const column = ['left', 'middle', 'right'].includes(w.column) ? w.column : 'auto'
    const piece = w.piece && work.find((p) => p.slug === w.piece) // a hidden or deleted piece drops out
    if (piece) return { ...piece, column }
    return w.picture ? { title: w.title || '', src: w.picture, column } : null
  }).filter(Boolean)
  // Shop pieces that are not in the list join the end of it (unless that is switched off), so a
  // new piece shows on the wall without a second trip to the admin.
  const missing = wallAddNew === false && placed.length ? [] : work.filter((p) => !placed.some((w) => w.slug === p.slug)).map((p) => ({ ...p, column: 'auto' }))
  // What the wall shows: that list (the first way it worked), the pieces of one category and/or
  // universe (horror for October, DC villains...), or the whole Shop in a new order every visit.
  // A choice nothing matches falls back to the list, so the wall is never empty.
  const onWall = wallShow === 'random' ? mixed(work)
    : wallShow === 'pick' ? work.filter((p) => (!wallCategory || p.category === wallCategory) && (!wallUniverse || p.universe === wallUniverse))
    : []
  heroWall = onWall.length ? onWall.map((p) => ({ ...p, column: 'auto' })) : [...placed, ...missing]

  // a section's "also show pieces from Work" choice: none, every piece, or one category
  const fromWork = (from) => (!from || from === 'none' ? [] : work)
    .filter((p) => p.src && (from === 'all' || p.category === from))
    .map((p) => ({ title: p.title, src: p.src, note: p.note, category: p.category, date: p.date, link: p.link, piece: p.slug, slug: p.slug, price: p.price }))
  gallerySections = live(folder('gallery-sections'))
    .map((s) => ({ ...s, items: [...fromWork(s.from), ...(s.items || []).filter((g) => g && g.src)] }))
    .filter((s) => s.items.length > 0)
    .sort(byOrder)
  gallery = gallerySections.flatMap((s) => s.items)
  const listed = new Set(shows('home', 'latest') ? latest.map((p) => p.slug) : [])
  const once = new Set()
  galleryHome = [...gallery.filter((g) => g.home), ...gallery.filter((g) => !g.home && !listed.has(g.piece))]
    .filter((g) => !once.has(g.src) && once.add(g.src))
    .slice(0, 6)

  redraws = live(folder('redraws'))
    .map((r) => ({ ...r, stages: (r.stages || []).filter((s) => s && s.year) }))
    .filter((r) => r.stages.length > 1)
    .sort(byOrder)
  events = live(folder('events')).filter((e) => e.name).sort(byOrder)
}
assemble(built)

/* Lay newer content over the built-in content: `content` maps a file to its new contents (or to
   null when it was deleted), `media` maps a newly uploaded picture's address to the picture. */
export function showLatest({ content = {}, media = {} }) {
  const merged = { ...built }
  for (const [path, data] of Object.entries(content)) {
    if (data == null) delete merged[path]
    else merged[path] = data
  }
  newPictures = media
  previewing = true
  assemble(merged)
}

/* Uploaded images are stored as "/uploads/x.jpg". Prefix the deploy base path. */
export const asset = (url) => newPictures[url] || (url && url.startsWith('/') ? import.meta.env.BASE_URL.replace(/\/$/, '') + url : url)

/* Prices. A piece has one price of its own, or a list of sizes (A3, A2...) each with its own
   price. Its own discount price is only used while the piece's status is "On sale" and it is
   below the usual price. A shop-wide sale (Shop → Sales) can also cover it; the lowest price wins,
   discounts never add up (api/_sales.js, which the checkout prices with too).
   priceOf(piece, size) is what one way of buying it costs: { size, was, now, sale, by }. A size
   that is not on the list gets the first size. Leaving the size out (undefined) means the cheapest. */
export const sizesOf = (piece) => (Array.isArray(piece?.sizes) ? piece.sizes : [])
export const priceOf = (piece, size) => {
  const sizes = sizesOf(piece)
  if (sizes.length && size === undefined) return sizes.map((s) => priceOf(piece, s.name)).sort((a, b) => a.now - b.now)[0]
  const s = sizes.length ? sizes.find((x) => x.name === size) || sizes[0] : { name: '', price: Number(piece?.price), salePrice: Number(piece?.salePrice) }
  const best = bestPrice(s.price, piece?.status === 'sale' ? s.salePrice : 0, piece, sales)
  return { size: s.name, was: s.price, now: best.now, sale: best.now < s.price, by: best.by }
}
/* "From" goes before a tile's price when the sizes do not all cost the same. */
export const priceVaries = (piece) => new Set(sizesOf(piece).map((s) => priceOf(piece, s.name).now)).size > 1
/* The ways to pay the admin offers (Shop & payments → Payment methods), in the order they show. */
export const payWays = () => (shop.payments === 'both' ? ['stripe', 'paypal'] : shop.payments === 'paypal' ? ['paypal'] : ['stripe'])
export const payName = (way) => (way === 'paypal' ? 'PayPal' : 'Stripe')
/* "Secure checkout by Stripe or PayPal" */
export const payLine = () => `Secure checkout by ${payWays().map(payName).join(' or ')}`

/* A piece shows its price while online purchases are switched on and it has a price. */
export const buyable = (piece) => Boolean(shop.enabled && piece && piece.slug && priceOf(piece).was > 0)
/* Its status, set in the admin: "new", "sale" (with a discount price below the price) or "soldout". */
export const soldOut = (piece) => piece?.status === 'soldout'
/* On sale: one size (or, with no size named, any of them) costs less than usual. */
export const onSale = (piece, size) => (size === undefined && sizesOf(piece).length ? sizesOf(piece).some((s) => priceOf(piece, s.name).sale) : priceOf(piece, size).sale)
/* What it costs now: the sale price while it is on sale, otherwise the price. */
export const nowPrice = (piece, size) => priceOf(piece, size).now
/* It can go into a checkout: it shows a price and is not sold out. */
export const canBuy = (piece) => buyable(piece) && !soldOut(piece)
/* The small tag on a piece. "New" shows whenever it is set; "Sale" and "Sold out" only while
   prices are showing, since without a price neither means anything. */
export const badge = (piece) => {
  if (!piece) return null
  if (buyable(piece) && soldOut(piece)) return { kind: 'soldout', text: 'Sold out' }
  if (buyable(piece) && onSale(piece)) {
    // the biggest discount across its sizes
    const off = Math.max(...(sizesOf(piece).length ? sizesOf(piece).map((s) => priceOf(piece, s.name)) : [priceOf(piece)]).map((p) => Math.round((1 - p.now / p.was) * 100)))
    return { kind: 'sale', text: `Sale −${off}%` }
  }
  if (piece.status === 'new') return { kind: 'new', text: 'New' }
  return null
}
/* 40 -> "$40 AUD", 12.5 -> "$12.50 AUD", in the shop's currency, the way prices are written in
   Australia. `short` leaves the code off ("$40"), for an old price shown beside the new one. */
export const money = (amount, short = false) => {
  const n = Number(amount)
  const code = String(shop.currency || 'aud').toUpperCase()
  let figure = String(amount)
  try { figure = new Intl.NumberFormat('en-AU', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n) } catch { /* an unknown code: the bare number */ }
  return short ? figure : `${figure} ${code}`
}

/* An address typed into the admin is only ever used as a link when it is an ordinary web address. */
export const safeUrl = (url) => (/^https?:\/\//i.test(String(url || '').trim()) ? String(url).trim() : null)

/* A name written in parts ("JBeatsArt") is split before its last capital that follows a small
   letter (JBeats | Art), so the second half can take the brand colour; a name with a space, or
   with nowhere to split, comes back whole. */
export const nameParts = (name = '') => {
  let cut = -1
  for (let i = 1; i < name.length; i++) if (/[A-Z]/.test(name[i]) && /[a-z]/.test(name[i - 1])) cut = i
  return cut < 0 || name.includes(' ') ? [name, ''] : [name.slice(0, cut), name.slice(cut)]
}

/* "2026-07-26" -> "26 Jul 2026" (and "Jul 26" for the short form). Dates are plain calendar days,
   so they are read as written rather than through a time zone. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const day = (date, short = false) => {
  const [y, m, d] = String(date || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return short ? `${MONTHS[m - 1]} ${d}` : `${d} ${MONTHS[m - 1]} ${y}`
}
