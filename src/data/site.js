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
export let nav
/* Every piece, newest first; the file name is the piece's id. */
export let work
/* The categories that have at least one piece, in the order they first appear. */
export let categories
/* Home shows up to six: the pieces ticked "Show on the home page", or simply the newest six. */
export let latest
/* Then-and-now sets: the same subject drawn again years later. */
export let redraws
export let events
/* True when the page is showing an admin their newest saved changes rather than only the built-in content. */
export let previewing = false

/* Hiding. Site settings → "Show or hide parts of the site" switches whole pages and sections off
   (anything not listed there is shown), and every entry has its own "Hide from the site" switch. */
let visibility = {}
export const shows = (group, key) => visibility[group]?.[key] !== false

let newPictures = {} // pictures saved after this build: "/uploads/x.webp" -> the picture itself

function assemble(content) {
  const settings = content['content/settings.json'] || {}
  // every file of one folder, each with the name of its file
  const folder = (name) => Object.entries(content)
    .filter(([path]) => path.startsWith(`content/${name}/`))
    .map(([path, data]) => ({ ...data, slug: path.split('/').pop().replace(/\.json$/, '') }))

  visibility = settings.visibility || {}
  brand = { name: 'DarkBeats', hue: 312, ...settings.brand }
  hero = settings.hero || {}
  marquee = settings.marquee || []
  home = settings.home || {}
  commissions = { tiers: [], steps: [], notes: [], ...settings.commissions }
  about = { paragraphs: [], facts: [], ...settings.about }
  contact = settings.contact || {}
  social = settings.social || []
  footer = settings.footer || {}

  nav = [
    { label: 'Home', to: '/' },
    { label: 'Work', to: '/work' },
    { label: 'Commissions', to: '/commissions' },
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' },
  ].filter((n) => n.to === '/' || shows('pages', n.to.slice(1)))

  work = live(folder('work'))
    .filter((p) => p.title)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  categories = [...new Set(work.map((p) => p.category).filter(Boolean))]
  const picked = work.filter((p) => p.featured)
  latest = (picked.length ? picked : work).slice(0, 6)
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

/* A two-part name ("DarkBeats") is split where its second capital starts, so the second half can
   take the brand colour; any other name comes back whole. */
export const nameParts = (name = '') => {
  const cut = name.slice(1).search(/[A-Z]/)
  return cut < 0 || name.includes(' ') ? [name, ''] : [name.slice(0, cut + 1), name.slice(cut + 1)]
}

/* "2026-07-26" -> "26 Jul 2026" (and "Jul 26" for the short form). Dates are plain calendar days,
   so they are read as written rather than through a time zone. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const day = (date, short = false) => {
  const [y, m, d] = String(date || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return short ? `${MONTHS[m - 1]} ${d}` : `${d} ${MONTHS[m - 1]} ${y}`
}
