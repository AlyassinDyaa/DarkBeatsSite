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

const files = import.meta.glob('../../content/**/*.json', { eager: true })
// keyed the way the repository names them: "content/work/venom.json"
const built = Object.fromEntries(Object.entries(files).map(([path, m]) => [path.replace('../../', ''), m.default ?? m]))

const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99)
const live = (list) => list.filter((x) => !x.hidden) // entries ticked "Hide from the site"

export let brand, hero, marquee, home, commissions, about, contact, social, footer
/* Selling: whether online purchases are on, the currency, what a buyer gets. */
export let shop
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

/* Leaves out anything not filled in, so the built-in wording below it shows through. */
const given = (fields) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null))

function assemble(content) {
  // the words on each page (content/pages) and what applies to the whole site (content/site)
  const page = (name) => content[`content/pages/${name}.json`] || {}
  const site = (name) => content[`content/site/${name}.json`] || {}
  const { social: links, footerLine, footerFine, ...name } = site('brand')
  const { kicker, text, primaryLabel, secondaryLabel, buttons, figure, wall, wallSpeed, wallAddNew, marquee: words, ...sections } = page('home')
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
    closedTitle: 'Join the queue', closedText: 'The books are closed for now. Send the idea anyway and you will hear back when a slot opens.',
    tiers: [], steps: [], notes: [],
    ...given(page('commissions')),
  }
  about = { paragraphs: [], facts: [], ...given(page('about')) }
  contact = { label: 'Say hello', title: 'Get in touch', topics: [], ...given(page('contact')) }
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
  social = links || []
  brand.instagram = social.find((s) => /instagram/i.test(s.label || ''))?.url
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
  work = work.map((p) => ({ ...p, what: typeNotes[p.type] || shop.note || '' }))
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
  heroWall = [...placed, ...missing]

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

/* A piece shows its price while online purchases are switched on and it has a price. */
export const buyable = (piece) => Boolean(shop.enabled && piece && piece.slug && Number(piece.price) > 0)
/* Its status, set in the admin: "new", "sale" (with a sale price below the price) or "soldout". */
export const soldOut = (piece) => piece?.status === 'soldout'
export const onSale = (piece) => piece?.status === 'sale' && Number(piece.salePrice) > 0 && Number(piece.salePrice) < Number(piece.price)
/* What it costs now: the sale price while it is on sale, otherwise the price. */
export const nowPrice = (piece) => (onSale(piece) ? Number(piece.salePrice) : Number(piece.price))
/* It can go into a checkout: it shows a price and is not sold out. */
export const canBuy = (piece) => buyable(piece) && !soldOut(piece)
/* The small tag on a piece. "New" shows whenever it is set; "Sale" and "Sold out" only while
   prices are showing, since without a price neither means anything. */
export const badge = (piece) => {
  if (!piece) return null
  if (buyable(piece) && soldOut(piece)) return { kind: 'soldout', text: 'Sold out' }
  if (buyable(piece) && onSale(piece)) return { kind: 'sale', text: `Sale −${Math.round((1 - Number(piece.salePrice) / Number(piece.price)) * 100)}%` }
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
