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
/* Headings and introductions of the Work and Gallery pages. */
export let pages
export let nav
/* Every piece, newest first; the file name is the piece's id. */
export let work
/* The categories that have at least one piece, in the order they first appear. */
export let categories
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

  // Every piece of text has a built-in wording, so a settings file that predates a field still works.
  visibility = settings.visibility || {}
  brand = { name: 'DarkBeats', hue: 312, ...settings.brand }
  hero = { primaryLabel: 'See the work', secondaryLabel: 'Commission a piece', ...settings.hero }
  marquee = settings.marquee || []
  home = {
    latestLabel: 'Fresh ink', latestTitle: 'Latest pieces',
    galleryLabel: 'The gallery', galleryTitle: 'Up on the wall',
    redrawLabel: 'Keep drawing', redrawTitle: 'Then and now',
    commissionsTitle: 'Get something drawn', commissionsButton: 'How it works',
    eventsLabel: 'In person', eventsTitle: 'Find me at',
    ...settings.home,
  }
  commissions = {
    title: 'Get something drawn', processLabel: 'The process', processTitle: 'How it works',
    requestLabel: 'Request', requestTitle: 'Tell me the idea',
    closedTitle: 'Join the queue', closedText: 'The books are closed for now. Send the idea anyway and you will hear back when a slot opens.',
    tiers: [], steps: [], notes: [],
    ...settings.commissions,
  }
  about = { paragraphs: [], facts: [], ...settings.about }
  contact = { label: 'Say hello', title: 'Get in touch', ...settings.contact }
  contact.topics = contact.topics || []
  pages = {
    work: { label: 'The work', title: 'Everything so far', ...settings.pages?.work },
    gallery: { label: 'The gallery', title: 'Up on the wall', ...settings.pages?.gallery },
  }
  social = settings.social || []
  footer = { fine: 'Characters shown in fan art belong to their owners.', ...settings.footer }

  nav = [
    { label: 'Home', to: '/' },
    { label: 'Work', to: '/work' },
    { label: 'Gallery', to: '/gallery' },
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

  // a section's "also show pieces from Work" choice: none, every piece, or one category
  const fromWork = (from) => (!from || from === 'none' ? [] : work)
    .filter((p) => p.src && (from === 'all' || p.category === from))
    .map((p) => ({ title: p.title, src: p.src, note: p.note, category: p.category, date: p.date, link: p.link, piece: p.slug }))
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
