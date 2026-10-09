/* JBeatsArt admin shell.
   Decap CMS renders the editing screens; this adds what makes them easy to get around:
   1. a left navigation that never goes away, in three groups (what you add to, the words on
      each page, the whole site), with an overview screen of tiles in the same groups;
   2. edit forms broken into named groups, with short fields side by side;
   3. "Save" where Decap says "Publish", and after saving a return to the list the entry came from;
   4. a friendlier picture picker (the chosen picture is marked; double-click uses it);
   5. a proper "are you sure?" dialog in place of the browser's own;
   6. a slider for the colour (hue) of a piece. */
(() => {
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props)
    kids.forEach((k) => k != null && n.append(k))
    return n
  }
  const currentSection = () => (location.hash.match(/^#\/collections\/([^/?]+)/) || [])[1]
  const HOME = '#/home'

  /* Small line icons for the navigation and the Home tiles, keyed by section name. */
  const ICONS = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    work: 'M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M9 9h.01',
    gallery_sections: 'M4 4h7v9H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 15h7v5H4z',
    redraws: 'M4 5h16v14H4z M12 3v18 M8 10l-2 2 2 2 M16 10l2 2-2 2',
    events: 'M5 6h14v14H5z M5 10h14 M9 4v4 M15 4v4',
    settings: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 5v4 M10 15v4',
    pictures: 'M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M9 9h.01',
    signout: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10',
    view_list: 'M4 6h16 M4 12h16 M4 18h16',
    view_compact: 'M4 5h16 M4 9.5h16 M4 14h16 M4 18.5h16',
    view_cards: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
    view_gallery: 'M4 4h16v16H4z M4 15l4.5-4.5 4 4 2.5-2.5 5 5',
  }
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', ICONS[name] || ICONS.settings)
    svg.append(path)
    return svg
  }

  /* How each form is laid out. `groups` puts a heading above the named field;
     `half` fields sit two to a row; `inner` fields, which live inside a group of fields,
     sit three to a row. Field names are the ones in config.yml. A form in a collection of
     single pages is looked up as "collection/page". A heading never goes on an on/off switch:
     a switch is drawn as a box of its own and the heading would land inside it. */
  const LAYOUT = {
    work: { groups: { title: 'The piece', src: 'Pictures, and where they show' }, half: ['src', 'hover', 'category', 'type', 'universe', 'date', 'link', 'status', 'salePrice', 'price', 'featured', 'hidden'] },
    gallery_sections: { groups: { title: 'Section', from: 'Pictures' }, half: ['title', 'order'] },
    redraws: { groups: { title: 'The set', stages: 'The drawings, oldest first', order: 'Rarely needed' }, half: ['title', 'text'] },
    events: { groups: { name: 'The event', order: 'Rarely needed' }, half: ['name', 'when', 'role', 'place', 'order', 'hidden'] },
    'pages/home': {
      groups: { kicker: 'Top of the page', wallShow: 'Wall of pictures', figure: 'Character beside the name', marquee: 'Moving band of words', latestLabel: 'Latest pieces', galleryLabel: 'Work', redrawLabel: 'Then and now', commissionsTitle: 'Commissions', eventsLabel: 'Conventions' },
      half: ['wallCategory', 'wallUniverse', 'latestLabel', 'latestTitle', 'galleryLabel', 'galleryTitle', 'redrawLabel', 'redrawTitle', 'commissionsTitle', 'commissionsButton', 'eventsLabel', 'eventsTitle'],
      inner: ['layer', 'ground', 'size', 'x', 'y', 'page', 'style'],
    },
    'pages/lists': { groups: { workLabel: 'Shop page', galleryLabel: 'Work page' }, half: ['workLabel', 'workTitle', 'galleryLabel', 'galleryTitle'] },
    'pages/commissions': {
      groups: { title: 'Top of the page', tiers: 'What you offer', processLabel: 'How it works', requestLabel: 'Request form', notes: 'Good to know' },
      half: ['processLabel', 'processTitle', 'requestLabel', 'requestTitle'],
    },
    'pages/about': { groups: { title: 'Text', facts: 'Quick facts' }, half: [] },
    'pages/contact': { groups: { label: 'Top of the page', topics: 'Form' }, half: ['label', 'title'] },
    'pages/support': {
      groups: { label: 'The project', aboutLabel: 'About the project', artLabel: 'Project art', supportLabel: 'Ways to give', goalLabel: 'A goal (optional)', notes: 'Small print', homeLabel: 'On the home page' },
      half: ['label', 'title', 'logo', 'figure', 'aboutLabel', 'aboutTitle', 'artLabel', 'artTitle', 'supportLabel', 'supportTitle', 'customLabel', 'customUrl', 'soonTitle', 'soonText', 'goalSign', 'goalLabel', 'goalRaised', 'goalTarget'],
    },
    'site/brand': { groups: { name: 'Name', hue: 'Look', email: 'Contact details', social: 'Social links', footerLine: 'Footer' }, half: ['name', 'artist', 'email', 'location'] },
    'site/shop': { groups: { enabled: 'Selling online', currency: 'What you sell', signedChoice: 'Signed prints', pricePlace: 'On the cards', shipping: 'Delivery', thanksTitle: 'After a purchase' }, half: ['currency', 'buttonLabel', 'cartIcon', 'pricePlace', 'tagPlace', 'thanksTitle', 'thanksText'] },
    'pages/rewards': { groups: { rewardText: 'Before they confirm', pictures: 'Profile pictures', cards: 'Membership card designs', discounts: 'Discounts' }, half: [], inner: ['earnedBy', 'count', 'percent', 'days', 'cardLook'] },
    'site/sales': { groups: {}, half: [], inner: ['on', 'percent', 'starts', 'ends'] },
    'site/visibility': { groups: {}, half: [], inner: ['work', 'gallery', 'commissions', 'about', 'contact', 'support', 'ticker', 'latest', 'redraws', 'events'] },
  }

  /* The navigation and the Home screen list the sections in these groups, in this order, each
     group's sections in the order given. The Orders group (orders.js) goes in right after Shop.
     A section not named here lands in the last group, so nothing new ever goes missing. */
  const GROUPS = [
    { id: 'shop', label: 'Shop', short: 'Shop', lead: 'What you sell, how it is sorted, and how buyers pay.', keys: ['work', 'site/categories', 'site/sales', 'site/shop', 'pages/rewards'] },
    { id: 'art', label: 'Your art', short: 'Your art', lead: 'The Work page, before-and-afters, conventions, and every picture you have uploaded.', keys: ['gallery_sections', 'redraws', 'events'], media: true },
    { id: 'pages', label: 'Words on each page', short: 'Page text', lead: 'Headings, introductions and buttons, one short form per page.', keys: ['pages/home', 'pages/lists', 'pages/commissions', 'pages/about', 'pages/contact', 'pages/support', 'pages/account'] },
    { id: 'site', label: 'Whole site', short: 'Site', lead: 'Your name and colour, and which parts are switched on.', keys: ['site/brand', 'site/visibility'] },
  ]
  const named = new Set(GROUPS.flatMap((g) => g.keys))
  GROUPS.forEach((g, i) => { g.has = (s) => g.keys.includes(s.key) || (i === GROUPS.length - 1 && !named.has(s.key)) })
  const inOrder = (g, list) => list.filter(g.has).sort((a, b) => (g.keys.indexOf(a.key) + 1 || 99) - (g.keys.indexOf(b.key) + 1 || 99))
  /* The navigation is narrow, and under "Page text" every name would end in "page": there the
     pages go by these shorter names. Tiles and form headings keep the full ones. */
  const SHORT = { work: 'Pieces', 'site/categories': 'Categories', 'site/shop': 'Shop settings', 'site/sales': 'Sales', 'pages/rewards': 'Rewards', 'pages/home': 'Home', 'pages/lists': 'Shop & Work', 'pages/commissions': 'Commissions', 'pages/about': 'About', 'pages/contact': 'Contact', 'pages/support': 'Support', 'pages/account': 'Customer account', 'site/brand': 'Brand & contact', 'site/visibility': 'Show / hide' }
  /* One line about each single page, for its tile on the Home screen. */
  const ABOUT = {
    'pages/home': 'The top of the home page, the character beside the name, and the heading of each part below it.',
    'pages/lists': 'The heading and introduction above the Shop page and the Work page.',
    'pages/commissions': 'Open or closed, what you offer and what it costs, how it works.',
    'pages/about': 'Who you are: the heading, the paragraphs and the quick facts.',
    'pages/contact': 'The heading, the introduction and what visitors can say their message is about.',
    'pages/support': 'Your own project: what it is, its art, and the payment links fans use to back it.',
    'pages/account': 'What customers read on their account page: your note to them, its headings, and the free profile pictures.',
    'pages/rewards': 'Profile pictures, membership card designs and discounts customers earn: by confirming their email, every few orders, or the prints they collect.',
    'site/brand': 'Site name, tagline, brand colour, logo, email, social links and the footer.',
    'site/shop': 'Switch online purchases on or off, and set the currency and delivery.',
    'site/sales': 'A percentage off everything, or off one category, type or universe: running now, or between two dates.',
    'site/categories': 'The Shop’s lists: categories (Heroes, Villains...), types (Posters, Stickers...) and universes (DC, Marvel...).',
    'site/visibility': 'Switch whole pages, or parts of the home page, on and off.',
  }
  Object.assign(ICONS, {
    'pages/home': 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    'pages/lists': 'M4 5h16 M4 10h10 M4 15h16 M4 20h8',
    'pages/commissions': 'M5 4h14v16l-3.500-2-3.500 2-3.500-2L5 20z M9 9h6 M9 13h4',
    'pages/about': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
    'pages/contact': 'M4 6h16v12H4z M4 7l8 6 8-6',
    'pages/account': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c.8-3.800 4-6 8-6s7.200 2.200 8 6 M17 3.500l.900 1.800 2 .300-1.450 1.400.350 2-1.800-.950-1.800.950.350-2L14.100 5.600l2-.300z',
    'pages/support': 'M12 20s-7-4.500-7-10a4 4 0 0 1 7-2.600A4 4 0 0 1 19 10c0 5.500-7 10-7 10z',
    'pages/rewards': 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8 20h8 M9.500 17h5v3h-5z',
    'site/brand': 'M12 3l2.600 5.600 6.100.700-4.500 4.200 1.200 6-5.400-3-5.400 3 1.200-6L3.300 9.300l6.100-.700z',
    'site/shop': 'M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2',
    'site/sales': 'M3 12V4h8l10 10-8 8z M7.500 8.500h.010',
    'site/categories': 'M4 5h7v7H4z M13 5h7v7h-7z M4 14h7v5H4z M13 14h7v5h-7z',
    'site/visibility': 'M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12z M12 9.500a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5z',
  })
  ICONS.adminhome = 'M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z'
  ICONS.menu = 'M4 7h16 M4 12h16 M4 17h16'
  ICONS.library = 'M4 7h12v12H4z M8 7V4h12v12h-4 M4 16l3.500-3.500 3 3 2-2 3.500 3.500'
  ICONS.external = 'M14 5h5v5 M19 5l-8 8 M11 7H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5'

  const currentFile = () => (location.hash.match(/^#\/collections\/[^/]+\/entries\/([^/?]+)/) || [])[1]
  const layoutNow = () => LAYOUT[`${currentSection()}/${currentFile()}`] || LAYOUT[currentSection()]
  /* Collections that are a fixed set of single pages rather than a list that grows. */
  const singles = new Set()
  let known = [] // every section, once config.yml has been read

  // ---------- read the sections out of config.yml ----------
  // A list that grows is one section. A collection of single pages gives one section per page.
  const readSections = async () => {
    const cfg = (await (await fetch('config.yml')).text()).replace(/\r\n/g, '\n')
    const body = cfg.slice(cfg.indexOf('\ncollections:'))
    const pick = (text, indent, key) => ((text.match(new RegExp(`^ {${indent}}${key}: (.+)$`, 'm')) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '')
    return body.split(/\n {2}- name: /).slice(1).flatMap((block) => {
      const name = block.split('\n')[0].trim()
      if (!/^ {4}files:$/m.test(block)) return [{ name, key: name, label: pick(block, 4, 'label'), singular: pick(block, 4, 'label_singular') || pick(block, 4, 'label'), description: pick(block, 4, 'description'), canAdd: /^ {4}create: true$/m.test(block) }]
      singles.add(name)
      return block.slice(block.indexOf('\n    files:')).split(/\n {6}- name: /).slice(1).map((entry) => {
        const file = entry.split('\n')[0].trim()
        return { name, file, key: `${name}/${file}`, label: pick(entry, 8, 'label'), description: ABOUT[`${name}/${file}`] || '', canAdd: false }
      })
    })
  }

  const openMedia = (tries = 0) => {
    const btn = [...document.querySelectorAll('header button')].find((b) => /media/i.test(b.textContent))
    if (btn) return btn.click()
    if (tries === 0) location.hash = '#/collections/work'
    if (tries < 30) setTimeout(() => openMedia(tries + 1), 150)
  }

  const build = async () => {
    const sections = known = await readSections()
    const hrefOf = (s) => (s.file ? `#/collections/${s.name}/entries/${s.file}` : `#/collections/${s.name}`)
    const groups = GROUPS.map((g) => ({ ...g, sections: inOrder(g, sections) })).filter((g) => g.sections.length)

    // ---- left navigation
    const search = el('input', { type: 'search', placeholder: 'Search everything', ariaLabel: 'Search everything' })
    const form = el('form', { className: 'ia-search' }, [search])
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const q = search.value.trim()
      if (q) location.hash = `#/search/${encodeURIComponent(q)}`
    })
    const home = el('a', { href: HOME, className: 'ia-home-link' }, [icon('adminhome'), el('span', { textContent: 'Overview' })])
    const links = []
    const linkTo = (s) => { const a = Object.assign(el('a', { href: hrefOf(s), title: s.label }, [icon(s.key), el('span', { textContent: SHORT[s.key] || s.label })]), { section: s.name, file: s.file }); links.push(a); return a }
    const media = el('button', { type: 'button' }, [icon('library'), el('span', { textContent: 'Pictures' })])
    // Sign out: forget this browser's login and show the login page again. (Unsaved changes on
    // an open form still get the browser's "leave this page?" question first.)
    const out = el('button', { type: 'button', className: 'ia-out' }, [icon('signout'), el('span', { textContent: 'Sign out' })])
    out.addEventListener('click', () => {
      try { if (window.netlifyIdentity && window.netlifyIdentity.currentUser()) window.netlifyIdentity.logout() } catch { /* not that kind of login */ }
      try { localStorage.removeItem('decap-cms-user') } catch { /* nothing stored */ }
      location.hash = '#/'
      location.reload()
    })
    media.addEventListener('click', () => openMedia())
    const side = el('aside', { className: 'ia-side' }, [
      el('a', { className: 'ia-brand', href: HOME }, [el('img', { src: '../favicon.png', alt: '' }), el('span', {}, [el('strong', { textContent: 'JBeatsArt' }), el('small', { textContent: 'Admin' })])]),
      form,
      // the list of sections scrolls by itself on a short screen; the brand above and the foot below stay put
      el('div', { className: 'ia-scroll' }, [
        el('nav', { ariaLabel: 'Admin' }, [home]),
        ...groups.flatMap((g) => {
          const nav = el('nav', { ariaLabel: g.label }, [...g.sections.map(linkTo), ...(g.media ? [media] : [])])
          nav.dataset.group = g.id
          return [el('div', { className: 'ia-label', textContent: g.short }), nav]
        }),
      ]),
      el('div', { className: 'ia-foot' }, [
        el('a', { className: 'ia-site', href: '../', target: '_blank', rel: 'noopener' }, [icon('external'), el('span', { textContent: 'View site' })]),
        out,
      ]),
    ])

    // ---- home screen: the same groups, as tiles
    const tile = (s) => el('div', { className: 'ia-tile' }, [
      el('div', { className: 'ia-tile-icon' }, [icon(s.key)]),
      el('h3', { textContent: s.label }),
      el('p', { textContent: s.description }),
      el('div', { className: 'ia-tile-actions' }, [
        el('a', { className: 'ia-btn', href: hrefOf(s), textContent: s.file ? 'Edit' : 'See all' }),
        s.canAdd ? el('a', { className: 'ia-btn ghost', href: `#/collections/${s.name}/new`, textContent: `+ New ${s.singular.toLowerCase()}` }) : null,
      ]),
    ])
    const mediaTile = el('div', { className: 'ia-tile' }, [el('div', { className: 'ia-tile-icon' }, [icon('pictures')]), el('h3', { textContent: 'Pictures' }), el('p', { textContent: 'Every picture uploaded to the site. Upload new ones or remove old ones.' }), el('div', { className: 'ia-tile-actions' }, [(() => { const b = el('button', { type: 'button', className: 'ia-btn', textContent: 'Open the library' }); b.addEventListener('click', () => openMedia()); return b })()])])
    const homeScreen = el('main', { className: 'ia-home' }, [
      el('div', { className: 'ia-home-inner' }, [
        el('div', { className: 'ia-kicker', textContent: 'JBeatsArt admin' }),
        el('h1', { textContent: 'What do you want to update?' }),
        el('p', { className: 'ia-lead', textContent: 'Pick a part of the site. Changes go live when you press Save.' }),
        ...groups.map((g) => el('section', { className: 'ia-group' }, [
          el('h2', { textContent: g.label }),
          el('p', { textContent: g.lead }),
          el('div', { className: 'ia-tiles' }, [...g.sections.map(tile), ...(g.media ? [mediaTile] : [])]),
        ])),
      ]),
    ])
    // ---- phones and small tablets: the navigation is a drawer, opened from a bar across the top
    const menu = el('button', { type: 'button', className: 'ia-menu', ariaLabel: 'Menu' }, [icon('menu')])
    const top = el('div', { className: 'ia-top' }, [menu, el('a', { className: 'ia-top-brand', href: HOME }, [el('img', { src: '../favicon.png', alt: '' }), el('strong', { textContent: 'JBeatsArt' }), el('small', { textContent: 'Admin' })])])
    const shade = el('div', { className: 'ia-shade' })
    const drawer = (open) => { document.documentElement.toggleAttribute('data-ia-menu', open); menu.setAttribute('aria-expanded', String(open)) }
    menu.addEventListener('click', () => drawer(!document.documentElement.hasAttribute('data-ia-menu')))
    shade.addEventListener('click', () => drawer(false))
    side.addEventListener('click', (e) => { if (e.target.closest('a, button')) drawer(false) })
    addEventListener('hashchange', () => drawer(false))
    addEventListener('keydown', (e) => { if (e.key === 'Escape') drawer(false) })
    document.body.append(top, shade, side, homeScreen)

    const sync = () => {
      // an address left over from an older layout of this panel (a bookmark, a tab left open)
      // names a section that no longer exists: show the overview instead of an empty form
      const section = currentSection()
      if (section && !sections.some((s) => s.name === section)) { location.hash = HOME; return }
      const onHome = location.hash === HOME
      document.documentElement.toggleAttribute('data-ia-home', onHome)
      home.classList.toggle('on', onHome)
      links.forEach((a) => a.classList.toggle('on', !onHome && a.section === currentSection() && (!a.file || a.file === currentFile())))
    }
    addEventListener('hashchange', sync)
    sync()
  }

  // Land on Home rather than on whichever section happens to be first.
  const landing = !location.hash || location.hash === '#/' || location.hash === '#'
  if (landing) {
    const wait = setInterval(() => {
      if (document.querySelector('[class*="AppHeader"]')) { clearInterval(wait); location.hash = HOME }
    }, 200)
    setTimeout(() => clearInterval(wait), 20000)
  }
  build().catch((e) => console.warn('admin navigation unavailable', e))

  // ---------- never jump straight from one open entry to another ----------
  /* Decap only loads an entry when its editor opens. Going directly from one entry to another
     (for instance clicking "Home page" while a piece is open) keeps the editor open and
     would show the first entry's values in the second entry's form. So such a jump goes by way
     of an address Decap has nothing to show for, which closes the editor without loading
     anything, and straight on to the form that was asked for; anything else (back/forward
     buttons) falls back to a clean reload.

     While a form is on its way, Decap blanks the page and writes "Loading entry...". In its
     place the panel shows the outline of the form at once, under the right heading, and the
     real fields replace it as soon as they arrive (see "waiting" below). */
  const BETWEEN = '#/between'
  const isEntry = (hash) => /^#\/collections\/[^/]+\/(new|entries\/)/.test(hash)
  const editorOpen = () => !!document.querySelector('[class*="ToolbarContainer"]')
  let steering = false
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[href^="#/collections/"]')
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return
    const target = link.getAttribute('href')
    if (!isEntry(target) || !isEntry(location.hash) || target === location.hash) return
    e.preventDefault()
    steering = true
    const back = location.hash
    waiting(target)
    location.hash = BETWEEN // Decap asks first if there are unsaved changes
    let tries = 0
    const go = setInterval(() => {
      if (location.hash === back && tries > 2) { clearInterval(go); steering = false; waiting(null) } // the admin chose to stay
      else if (!editorOpen()) { clearInterval(go); location.hash = target; setTimeout(() => { steering = false }, 300) }
      else if (++tries > 60) { clearInterval(go); steering = false; waiting(null) }
    }, 20)
  }, true)

  /* ---------- waiting: the outline of a form, shown until the form itself is there ---------- */
  let outline = null
  const waiting = (hash) => {
    if (outline) { clearInterval(outline.watch); outline.box.remove(); outline = null }
    if (!hash || !isEntry(hash)) return
    const [, name, , file] = hash.match(/^#\/collections\/([^/]+)\/(new|entries\/([^/?]+))/) || []
    const section = known.find((s) => s.name === name && (s.file ? s.file === file : true))
    const title = !section ? '' : section.file ? section.label : /\/new/.test(hash) ? `New ${section.singular.toLowerCase()}` : section.label
    const row = (wide) => el('div', { className: `ia-wait-field ${wide ? 'wide' : ''}` }, [el('i'), el('b')])
    const box = el('div', { className: 'ia-wait', ariaHidden: 'true' }, [
      el('div', { className: 'ia-wait-bar' }, [el('span', { className: 'ia-wait-back' }), el('strong', { textContent: title })]),
      el('div', { className: 'ia-wait-form' }, [row(true), row(), row(), row(true), row(), row()]),
    ])
    document.body.append(box)
    const since = Date.now()
    const watch = setInterval(() => {
      const ready = location.hash === hash && document.querySelector('[class*="ControlPaneContainer"] label')
      if (ready || Date.now() - since > 12000) waiting(null)
    }, 30)
    outline = { box, watch }
  }
  // the same outline when a form is opened from a list, a tile or the navigation
  addEventListener('hashchange', (e) => {
    const to = new URL(e.newURL).hash
    if (isEntry(to) && !outline && !document.querySelector('[class*="ControlPaneContainer"] label')) waiting(to)
    if (!isEntry(to) && to !== BETWEEN) waiting(null)
  })
  addEventListener('hashchange', (e) => {
    const from = new URL(e.oldURL).hash, to = new URL(e.newURL).hash
    const saved = /^#\/collections\/[^/]+\/new/.test(from) && /\/entries\//.test(to) // a new entry getting its address
    // (moving on to a brand-new entry is fine: Decap starts that one empty by itself)
    if (!steering && !saved && isEntry(from) && /\/entries\//.test(to) && from !== to) location.reload()
  })

  // ---------- form layout: tag fields so the stylesheet can group and pair them ----------
  const fieldName = (field) => ((field.querySelector(':scope > [class*="ControlTopbar"] label[for], :scope > label[for]') || {}).htmlFor || '').replace(/-field-\d+$/, '')
  const tagFields = () => {
    const layout = layoutNow()
    const pane = document.querySelector('[class*="ControlPaneContainer"]:not([class*="PreviewPaneContainer"])')
    if (!pane) return
    for (const field of pane.children) {
      const name = fieldName(field)
      const group = layout && layout.groups[name]
      const half = layout && layout.half.includes(name)
      // only touch the attribute when it is wrong, so this never loops with the observer below
      if (group && field.dataset.iaGroup !== group) field.dataset.iaGroup = group
      if (!group && 'iaGroup' in field.dataset) delete field.dataset.iaGroup
      if (half && !('iaHalf' in field.dataset)) field.dataset.iaHalf = ''
      if (!half && 'iaHalf' in field.dataset) delete field.dataset.iaHalf
    }
    // short fields inside a group of fields (a picture's size, position, turn...) share rows too
    const inner = (layout && layout.inner) || []
    for (const label of inner.length ? pane.querySelectorAll('[class*="ControlContainer"] [class*="ControlContainer"] label[for]') : []) {
      const field = label.closest('[class*="ControlContainer"]')
      if (!inner.includes(label.htmlFor.replace(/-field-\d+$/, '')) || 'iaInner' in field.dataset) continue
      field.dataset.iaInner = ''
      field.parentElement.dataset.iaGrid = ''
    }
    markRequired(pane)
    nameTheForm()
    for (const input of pane.querySelectorAll('.ia-compact input:not([placeholder]), .ia-pics input:not([placeholder])')) {
      const label = input.closest('[class*="ControlContainer"]')?.querySelector('label')
      if (label) input.placeholder = label.textContent.replace(/\s*\(optional\)\s*$/i, '')
    }
    // the lists of Shop categories are drawn as compact rows
    for (const field of pane.querySelectorAll('[class*="ControlContainer"]')) {
      const name = (field.querySelector(':scope > [class*="ControlTopbar"] label[for]') || {}).htmlFor || ''
      const compact = (currentSection() === 'site' && /^(subjects|types|universes)-field/.test(name)) || (currentSection() === 'work' && /^sizes-field/.test(name))
      if (compact !== field.classList.contains('ia-compact')) field.classList.toggle('ia-compact', compact)
      // the free profile pictures (Customer account page): a grid of round tiles
      const pics = currentSection() === 'pages' && /^icons-field/.test(name)
      if (pics !== field.classList.contains('ia-pics')) field.classList.toggle('ia-pics', pics)
    }
    // the wall on the home page: only the fields that matter for what it shows
    const fields = new Map([...pane.children].map((f) => [fieldName(f), f]))
    if (fields.has('wallShow')) {
      const said = (fields.get('wallShow').querySelector('[class*="singleValue"]') || {}).textContent || ''
      const mode = /random/i.test(said) ? 'random' : /category|universe/i.test(said) ? 'pick' : 'list'
      const off = { wallCategory: mode !== 'pick', wallUniverse: mode !== 'pick', wall: mode !== 'list', wallAddNew: mode !== 'list' }
      for (const [name, hide] of Object.entries(off)) {
        const field = fields.get(name)
        if (field && hide !== ('iaOff' in field.dataset)) { if (hide) field.dataset.iaOff = ''; else delete field.dataset.iaOff }
      }
    }
  }

  /* Decap heads every form "Writing in X collection". Say what is being edited instead: the
     page's own name for a single page ("Home page"), the section's name for anything else. */
  const nameTheForm = () => {
    const title = document.querySelector('[class*="ToolbarContainer"] [class*="BackCollection"]')
    const here = known.find((s) => s.name === currentSection() && (s.file ? s.file === currentFile() : true))
    if (!title || !here) return
    const want = here.file ? here.label : /\/new/.test(location.hash) ? `New ${here.singular.toLowerCase()}` : here.label
    if (title.textContent !== want) title.textContent = want
  }

  /* Decap only labels the optional fields ("(optional)"); everything else must be filled in.
     Mark those so the stylesheet can add a red asterisk. On/off switches, sliders and plain
     groups of fields are skipped: none of them is something you can leave "empty". */
  const markRequired = (pane) => {
    for (const label of pane.querySelectorAll('label[class*="FieldLabel"]')) {
      const field = label.closest('[class*="ControlContainer"]')
      if (!field) continue
      const optional = /\(optional\)\s*$/i.test(label.textContent)
      const isSwitch = !!field.querySelector(':scope > div > [class*="ToggleContainer"]')
      const bar = field.querySelector(':scope > div > [class*="TopBarContainer"]')
      const isGroup = !!bar && !bar.querySelector('[class*="AddButton"]')
      const isSlider = !!field.querySelector(':scope > .ia-slider')
      // "(optional)" after an on/off switch says nothing: a switch is always either on or off
      if (isSwitch && optional) for (const node of label.querySelectorAll('*')) if (!node.children.length) node.textContent = node.textContent.replace(/\s*\(optional\)\s*$/i, '')
      const required = !optional && !isSwitch && !isGroup && !isSlider
      if (required !== label.hasAttribute('data-ia-required')) label.toggleAttribute('data-ia-required', required)
    }
  }
  /* ---------- pictures on the cards ----------
     The two card views show a picture for each entry. Which picture belongs to which entry comes
     from thumbs.json (see vite.config.js); it is asked for again whenever a list is opened, since
     a save may have changed it. An entry without a picture says so; a section that never has
     pictures (Conventions) gets plain cards with no empty frame. */
  let thumbs = {}, thumbsAt = 0
  const loadThumbs = () => {
    if (Date.now() - thumbsAt < 10000) return
    thumbsAt = Date.now()
    fetch('thumbs.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((found) => { thumbs = found || {}; paintThumbs() }).catch(() => { /* cards simply stay without pictures */ })
  }
  const paintThumbs = () => {
    const section = currentSection()
    const cards = document.querySelectorAll('[class*="GridCardLink"]')
    if (!section || !cards.length) return
    loadThumbs()
    const any = Object.keys(thumbs).some((key) => key.startsWith(`${section}/`))
    for (const link of cards) {
      if (link.querySelector('[class*="CardImage"], [class*="StyledImage"]')) continue // Decap found a picture itself
      const slug = ((link.getAttribute('href') || '').match(/\/entries\/([^/?]+)/) || [])[1]
      const picture = slug && thumbs[`${section}/${decodeURIComponent(slug)}`]
      let frame = link.querySelector(':scope > .ia-thumb')
      if (picture) {
        if (!frame) { frame = el('span', { className: 'ia-thumb' }); link.append(frame) }
        const image = `url("${new URL(`..${picture}`, location.href.split('#')[0]).href}")`
        if (frame.dataset.image !== image) { frame.dataset.image = image; frame.style.backgroundImage = image }
      } else if (frame) frame.remove()
      // only touch the attribute when it is wrong, so this never loops with the observer below
      const state = picture ? 'picture' : any ? 'none' : 'plain'
      if (link.dataset.iaThumb !== state) link.dataset.iaThumb = state
    }
  }

  let tagTimer
  const scheduleTag = () => { clearTimeout(tagTimer); tagTimer = setTimeout(() => { tagFields(); syncViews(); paintThumbs() }, 60) }

  /* ---------- list views ----------
     Decap offers rows or cards, one choice for the whole admin. Here every list gets four views
     and remembers its own (saved in this browser, per section; search results count as one
     place). Nothing saved yet means the first view, List. Two of the views are restyled rows
     and two are restyled cards, so Decap is switched to whichever the chosen view is built on. */
  const VIEWS = [
    { id: 'list', label: 'List', cards: false },
    { id: 'compact', label: 'Compact list', cards: false },
    { id: 'cards', label: 'Cards', cards: true },
    { id: 'gallery', label: 'Big pictures', cards: true },
  ]
  const viewPlace = () => currentSection() || (/^#\/search/.test(location.hash) ? 'search' : 'other')
  const chosenView = () => {
    let saved = null
    try { saved = localStorage.getItem(`ia.view.${viewPlace()}`) } catch { /* storage switched off: use the default */ }
    return VIEWS.find((v) => v.id === saved) || VIEWS[0]
  }
  let lastSwitch = 0
  const syncViews = () => {
    const section = document.querySelector('[class*="ViewControlsSection"]')
    if (!section) return
    let bar = section.querySelector(':scope > .ia-views')
    if (!bar) {
      bar = el('div', { className: 'ia-views', role: 'group', ariaLabel: 'How to show this list' }, VIEWS.map((v, i) => {
        const b = el('button', { type: 'button', title: i ? v.label : `${v.label} (the default)`, ariaLabel: v.label }, [icon(`view_${v.id}`)])
        b.dataset.view = v.id
        b.addEventListener('click', () => {
          try { localStorage.setItem(`ia.view.${viewPlace()}`, v.id) } catch { /* not remembered, still applied below */ }
          document.documentElement.dataset.iaView = v.id
          syncViews()
        })
        return b
      }))
      section.append(bar)
    }
    let view = chosenView()
    // with storage switched off the choice lives only on the page, for as long as this list is open
    try { localStorage.getItem('ia.view.test') } catch { view = VIEWS.find((v) => v.id === document.documentElement.dataset.iaView) || view }
    if (document.documentElement.dataset.iaView !== view.id) document.documentElement.dataset.iaView = view.id
    for (const b of bar.children) {
      const on = String(b.dataset.view === view.id)
      if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on)
    }
    const shown = document.querySelector('[class*="CardsGrid"] > li')
    if (!shown || Date.now() - lastSwitch < 400) return
    if (/GridCard/.test(shown.className) !== view.cards) {
      lastSwitch = Date.now()
      section.querySelectorAll(':scope > [class*="ViewControlsButton"]')[view.cards ? 1 : 0]?.click()
    }
  }

  /* ---------- wording: "Save", not "Publish" ----------
     Decap's own word for putting an entry on the site is "Publish". The admins here call that
     saving, so its English phrases are swapped for these. With the review workflow switched on
     (the live site) Decap has a second button that only stores a draft; that one becomes
     "Save draft" so the two cannot be mixed up. */
  if (window.CMS && window.CMS.getLocale && window.CMS.registerLocale) {
    const over = (base, changes) => {
      const out = { ...base }
      for (const [k, v] of Object.entries(changes)) out[k] = v && typeof v === 'object' ? over(out[k] || {}, v) : v
      return out
    }
    window.CMS.registerLocale('en', over(window.CMS.getLocale('en') || {}, {
      editor: {
        editor: {
          onPublishingNotReady: 'Please set the status to "Ready" before saving it to the site.',
          onPublishingWithUnsavedChanges: 'You have unsaved changes. Press "Save draft" first.',
          onPublishing: 'Save this entry to the site now?',
          onDeleteWithUnsavedChanges: 'Are you sure you want to delete this entry, as well as your unsaved changes from the current session?',
          onDeletePublishedEntry: 'Are you sure you want to delete this entry?',
        },
        editorToolbar: {
          publish: 'Save', publishNow: 'Save now', publishAndCreateNew: 'Save and create new', publishAndDuplicate: 'Save and duplicate',
          publishing: 'Saving...', published: 'Saved', save: 'Save draft', deletePublishedEntry: 'Delete entry',
        },
      },
      // on Vercel the "GitHub" login window is really the admin passcode (see /api/auth.js)
      auth: { login: 'Log in', loggingIn: 'Logging in...', loginWithGitHub: 'Log in', loginWithNetlifyIdentity: 'Log in', errors: { notRecognized: 'That login did not work. Try again.' } },
      ui: { default: { goBackToSite: 'Back to the site' }, toast: { entryPublished: 'Entry saved', onFailToPublishEntry: 'Failed to save: %{details}' } },
      workflow: { workflowCard: { publishChanges: 'Save changes to the site', publishNewEntry: 'Save new entry to the site' } },
    }))
  }

  // ---------- back to the list after saving ----------
  // Decap's success notice is the same for a draft and for the real thing, so the trigger is
  // the admin choosing "Save now" in the Save menu; the notice only confirms it worked.
  let publishAsked = 0
  document.addEventListener('click', (e) => {
    const item = e.target.closest?.('[class*="StyledMenuItem"], [role="menuitem"], button')
    if (item && /^\s*(save|publish) now\s*$/i.test(item.textContent)) publishAsked = Date.now()
  }, true)
  const backToList = () => {
    const section = currentSection()
    // a single page has no list to go back to: return to the overview instead
    if (section && /^#\/collections\/[^/]+\/(new|entries)/.test(location.hash)) location.hash = singles.has(section) ? HOME : `#/collections/${section}`
  }
  new MutationObserver((changes) => {
    scheduleTag()
    if (!publishAsked || Date.now() - publishAsked > 30000) return
    for (const c of changes) {
      for (const n of c.addedNodes) {
        const host = n instanceof HTMLElement ? n : n.parentElement
        const toast = host && (host.closest('.Toastify') ? host : host.querySelector('[class*="Toastify__toast"]'))
        if (toast && /entry (saved|published)/i.test(toast.textContent)) {
          publishAsked = 0
          // on the live site a save is only the start: the site still has to rebuild itself
          if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) tell('Saved', 'Open or refresh the site in this browser to see it straight away. Visitors see it in about a minute, once the site has rebuilt.', 'ok')
          // give Decap a moment to finish its own bookkeeping (a new entry gets its address first)
          setTimeout(backToList, 700)
          return
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true })

  // ---------- grouped fields: the whole heading row opens and closes it, not just the arrow ----------
  document.addEventListener('click', (e) => {
    const bar = e.target.closest?.('[class*="TopBarContainer"]')
    if (bar && !e.target.closest('button')) bar.querySelector('button[class*="ExpandButton"]')?.click()
  })

  // ---------- picture picker ----------
  const cards = () => [...document.querySelectorAll('.ReactModalPortal [class*="-Card "], .ReactModalPortal [class$="-Card"]')]
  const cardOf = (t) => t.closest?.('.ReactModalPortal [class*="-Card "], .ReactModalPortal [class$="-Card"]')
  const modalButton = (re) => [...document.querySelectorAll('.ReactModalPortal button')].find((b) => re.test(b.textContent))

  /* Which picture is selected is Decap's business (it also selects a picture right after an
     upload). Its only outward sign is a blue border set by that card's style rule, so read the
     rule and mirror the answer onto the card for the stylesheet to draw the ring and tick. */
  const selectedByClass = new Map()
  const isSelected = (card) => {
    const cls = (card.className.match(/css-[a-z0-9]+-Card/) || [])[0]
    if (!cls) return false
    if (!selectedByClass.has(cls)) {
      let blue = false
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        for (const r of rules) if (r.selectorText === '.' + cls && /58,\s*105,\s*199|#3a69c7/i.test(r.style.borderColor)) blue = true
      }
      selectedByClass.set(cls, blue)
    }
    return selectedByClass.get(cls)
  }
  const syncPicked = () => { for (const c of cards()) if (isSelected(c) !== c.hasAttribute('data-picked')) c.toggleAttribute('data-picked', isSelected(c)) }
  let pickTimer
  const schedulePick = () => { clearTimeout(pickTimer); pickTimer = setTimeout(syncPicked, 50) }
  new MutationObserver(schedulePick).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })

  // double-click = pick it and use it (the two clicks toggle the selection, so make sure it ends up on)
  document.addEventListener('dblclick', (e) => {
    const card = cardOf(e.target)
    if (!card) return
    setTimeout(() => {
      if (!isSelected(card)) card.click()
      setTimeout(() => { const btn = modalButton(/choose selected|insert/i); if (btn && !btn.disabled) btn.click() }, 120)
    }, 120)
  }, true)

  /* ---------- big pictures are made smaller before they are uploaded ----------
     On the live site a save travels through a small function that takes about 4 MB at most, and
     a picture grows by a third on the way. A large cut-out straight from an art program would be
     refused ("Failed to persist entry"). So a picture over about 900 KB is redrawn at up to
     2400 pixels on its long side and saved as WebP (see-through backgrounds are kept), which is
     also what the site wants: visitors download these. Smaller pictures go up untouched. */
  const ROOM = 2.6 * 1024 * 1024
  const heavy = (file) => /^image\/(png|jpeg|webp)$/.test(file.type) && file.size > 900 * 1024
  const lighter = async (file) => {
    if (!heavy(file)) return file
    try {
      const picture = await createImageBitmap(file)
      let side = Math.min(2400, Math.max(picture.width, picture.height))
      for (let attempt = 0; attempt < 6; attempt++) {
        const scale = side / Math.max(picture.width, picture.height)
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(picture.width * scale), height: Math.round(picture.height * scale) })
        canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height)
        const made = await new Promise((done) => canvas.toBlob(done, 'image/webp', 0.9))
        if (made && made.size <= ROOM && made.size < file.size) {
          const ending = made.type === 'image/webp' ? 'webp' : made.type === 'image/jpeg' ? 'jpg' : 'png'
          return new File([made], `${file.name.replace(/\.[^.]+$/, '')}.${ending}`, { type: made.type, lastModified: Date.now() })
        }
        side = Math.round(side * 0.8)
      }
    } catch { /* not a picture the browser can redraw: send it as it is */ }
    return file
  }
  document.addEventListener('change', (e) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || input.dataset.iaLighter || ![...(input.files || [])].some(heavy)) return
    // hold this announcement back, swap the files, then announce again for Decap to pick up
    e.stopImmediatePropagation()
    Promise.all([...input.files].map(lighter)).then((files) => {
      const bag = new DataTransfer()
      files.forEach((f) => bag.items.add(f))
      input.files = bag.files
      input.dataset.iaLighter = 'done'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      delete input.dataset.iaLighter
    })
  }, true)

  /* ---------- notices: when a save is refused, say why (and when it worked, what happens next) ----------
     Decap reports every refused save as "API_ERROR". The reason is in the answer it got, so
     watch the answers from the site's saving function and put the reason on screen in words. */
  const told = new Map()
  const tell = (title, text, kind = 'problem') => {
    if (Date.now() - (told.get(title) || 0) < 8000) return
    told.set(title, Date.now())
    const close = el('button', { type: 'button', ariaLabel: 'Close', textContent: '×' })
    const note = el('div', { className: `ia-notice ${kind}`, role: kind === 'ok' ? 'status' : 'alert' }, [el('strong', { textContent: title }), el('p', { textContent: text }), close])
    close.addEventListener('click', () => note.remove())
    document.body.append(note)
    setTimeout(() => note.remove(), 20000)
  }
  /* Before it opens a form on the live site, Decap asks GitHub which version of each file in that
     folder is the current one. The answer is the same for every form in the folder until
     something is saved, so it is kept for a minute and thrown away on any save: after the first
     form has opened, its neighbours open without a trip to the server. */
  const kept = new Map() // address -> { at, answer }
  const KEEP = 60 * 1000
  const plainFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const where = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''
    const how = String((args[1] && args[1].method) || (args[0] && args[0].method) || 'GET').toUpperCase()
    const reusable = how === 'GET' && where.includes('/api/gh/') && where.includes('/git/trees/')
    if (how !== 'GET' && where.includes('/api/gh/')) kept.clear()
    if (reusable) {
      const had = kept.get(where)
      if (had && Date.now() - had.at < KEEP) return had.answer.clone()
    }
    const answer = await plainFetch(...args)
    if (reusable && answer.ok) kept.set(where, { at: Date.now(), answer: answer.clone() })
    try {
      if (where.includes('/api/gh/') && !answer.ok) {
        const said = await answer.clone().json().then((j) => j && j.message, () => '')
        if (answer.status === 401) tell('You are logged out', 'Your login has run out. Press Sign out, log in again, then save once more.')
        else if (answer.status === 413) tell('That picture is too big', 'It could not be uploaded. Use a picture under about 3 MB, or save it as WebP or JPEG first.')
        else if (how !== 'GET' && (answer.status === 403 || answer.status === 404)) tell('The site is not allowed to save', `GitHub refused the change${said ? ` ("${said}")` : ''}. The token stored on Vercel as GITHUB_TOKEN needs "Contents: Read and write" for this repository. Fix the token, redeploy, then save again.`)
        else if (how !== 'GET' && answer.status >= 400) tell('The change was not saved', said ? `GitHub answered: "${said}". Nothing was lost on this page; try Save again.` : `The save was refused (error ${answer.status}). Nothing was lost on this page; try Save again.`)
      }
    } catch { /* explaining is a courtesy: never let it break the request itself */ }
    return answer
  }

  /* A picture uploaded while editing only reaches the site's folder when the entry is saved,
     so until then its preview address leads nowhere. Keep the uploaded file at hand and show it
     in place of the broken preview. */
  const fresh = new Map() // simplified file name -> local preview address
  const simple = (name) => String(name).split(/[\\/]/).pop().toLowerCase().replace(/[^a-z0-9.]+/g, '')
  document.addEventListener('change', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'file') for (const f of e.target.files || []) fresh.set(simple(f.name), URL.createObjectURL(f))
  }, true)
  document.addEventListener('error', (e) => {
    const img = e.target
    if (!(img instanceof HTMLImageElement) || img.src.startsWith('blob:')) return
    const local = fresh.get(simple(decodeURIComponent(img.getAttribute('src') || '')))
    if (local) img.src = local
  }, true)

  /* ---------- "are you sure?" ----------
     Decap asks with the browser's own confirm box (deleting an entry or a picture, leaving
     unsaved changes). That box cannot be styled and cannot wait for anything else, so: the
     first time it is asked the answer is "no" and our own dialog opens instead; if the admin
     confirms there, the same click is played again and this time the answer is "yes". */
  const browserConfirm = window.confirm.bind(window)
  let lastClick = null
  let agreed = new Set()
  document.addEventListener('click', (e) => { if (e.isTrusted && !e.target.closest('.ia-confirm')) { lastClick = { target: e.target, at: Date.now() }; agreed = new Set() } }, true)
  const ask = (message) => new Promise((resolve) => {
    const deleting = /delete|remove/i.test(message)
    const named = (document.querySelector('[class*="ControlPaneContainer"] input[type="text"]') || {}).value
    const title = deleting ? (named && /entry/i.test(message) ? `Delete “${named}”?` : 'Delete this?') : 'Are you sure?'
    const text = deleting && /entry/i.test(message) ? 'It comes off the site and out of the admin. This cannot be undone. To take it off the site but keep it, use its “Hide from the site” switch instead.' : message
    const no = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Cancel' })
    const yes = el('button', { type: 'button', className: `ia-btn ${deleting ? 'danger' : ''}`, textContent: deleting ? 'Yes, delete' : 'Yes' })
    const box = el('div', { className: 'ia-confirm', role: 'dialog', ariaModal: 'true' }, [
      el('div', { className: 'ia-confirm-card' }, [el('h2', { textContent: title }), el('p', { textContent: text }), el('div', { className: 'ia-confirm-actions' }, [no, yes])]),
    ])
    const close = (answer) => { document.removeEventListener('keydown', onKey, true); box.remove(); resolve(answer) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false) } }
    no.addEventListener('click', () => close(false))
    yes.addEventListener('click', () => close(true))
    box.addEventListener('click', (e) => { if (e.target === box) close(false) })
    document.addEventListener('keydown', onKey, true)
    document.body.append(box)
    no.focus()
  })
  window.confirm = (message) => {
    if (agreed.has(message)) return true
    const click = lastClick
    // nothing to play again (browser back button, a menu that has closed): fall back to the browser's box
    if (!click || Date.now() - click.at > 2000 || !click.target.isConnected) return browserConfirm(message)
    ask(message).then((yes) => { if (yes) { agreed.add(message); click.target.click() } })
    return false
  }

  /* ---------- slider: a number you drag ----------
     Used for the colour of a piece. The box beside the slider
     takes an exact number; the arrow puts the starting value back. */
  if (window.CMS && window.createClass && window.h) {
    const h = window.h
    window.CMS.registerWidget('slider', window.createClass({
      render() {
        const { value, onChange, forID, field, setActiveStyle, setInactiveStyle } = this.props
        const min = field.get('min', 0), max = field.get('max', 100), step = field.get('step', 1), start = field.get('default', min), unit = field.get('unit', '')
        const now = value === '' || value == null || Number.isNaN(Number(value)) ? start : Number(value)
        const fill = `${((Math.min(max, Math.max(min, now)) - min) / (max - min)) * 100}%`
        const set = (v) => onChange(v === '' ? '' : Math.min(max, Math.max(min, Number(v))))
        return h('div', { className: 'ia-slider' },
          h('input', { type: 'range', id: forID, min, max, step, value: now, style: { '--fill': fill }, onChange: (e) => set(e.target.value), onFocus: setActiveStyle, onBlur: setInactiveStyle }),
          h('label', { className: 'ia-slider-num' },
            h('input', { type: 'number', min, max, step, value: value === '' ? '' : now, 'aria-label': 'Exact value', onChange: (e) => set(e.target.value), onFocus: setActiveStyle, onBlur: setInactiveStyle }),
            unit && h('span', {}, unit)),
          h('button', { type: 'button', className: 'ia-slider-reset', title: `Back to ${start}${unit}`, 'aria-label': `Back to ${start}${unit}`, disabled: now === start, onClick: () => onChange(start) }, '↺'))
      },
    }))
  }
  /* ---------- the character beside the name: a live preview ----------
     The top of the home page, in a small frame, with the character as it is in the form right now
     (picture, place, size, position), before anything is saved. The frame is the site itself at
     /?preview=hero; this field reads the whole form a few times a second and sends the character's
     settings over whenever they change. It stores nothing. Computer or phone shape, at the press
     of a button. */
  if (window.CMS && window.createClass && window.h) {
    const h = window.h
    const SHAPES = { computer: [1440, 810], phone: [390, 844] }
    window.CMS.registerWidget('heropreview', window.createClass({
      getInitialState() { return { shape: 'computer' } },
      componentDidMount() {
        this.timer = setInterval(() => { this.fit(); this.send() }, 200)
        this.ready = (e) => { if (e.origin === location.origin && e.data && e.data.type === 'hero-preview-ready') { this.sent = ''; this.send() } }
        addEventListener('message', this.ready)
      },
      componentWillUnmount() { clearInterval(this.timer); removeEventListener('message', this.ready) },
      figure() {
        const entry = this.props.getEntry && this.props.getEntry()
        const data = entry && entry.get('data') ? entry.get('data').toJS() : {}
        const f = data.figure || {}
        const src = f.src ? String(this.props.getAsset(f.src) || '') : ''
        return { ...f, src }
      },
      send() {
        const frame = this.frame
        if (!frame || !frame.contentWindow) return
        const figure = this.figure()
        const said = JSON.stringify(figure)
        if (said === this.sent) return
        this.sent = said
        frame.contentWindow.postMessage({ type: 'hero-preview', figure }, location.origin)
      },
      fit() {
        const box = this.box, frame = this.frame
        if (!box || !frame) return
        const [w, ht] = SHAPES[this.state.shape]
        const k = this.state.shape === 'phone' ? Math.min(box.clientWidth / w, 480 / ht) : box.clientWidth / w
        const want = `translateX(-50%) scale(${k.toFixed(4)})`
        if (frame.style.transform !== want) { frame.style.width = `${w}px`; frame.style.height = `${ht}px`; frame.style.transform = want; box.style.height = `${Math.round(ht * k)}px` }
      },
      render() {
        const shape = this.state.shape
        const choice = (label, value) => h('button', { type: 'button', 'aria-pressed': String(shape === value), onClick: () => { this.sent = ''; this.setState({ shape: value }, () => this.fit()) } }, label)
        return h('div', { className: 'ia-heroprev' },
          h('div', { className: 'ia-heroprev-head' },
            h('strong', {}, 'Live preview'),
            h('div', { className: 'ia-heroprev-switch', role: 'group', 'aria-label': 'Screen' }, choice('Computer', 'computer'), choice('Phone', 'phone'))),
          h('div', { className: `ia-heroprev-stage is-${shape}`, ref: (el) => { this.box = el } },
            h('iframe', { key: shape, ref: (el) => { this.frame = el }, src: '../?preview=hero', title: 'Live preview of the top of the home page', tabIndex: -1, onLoad: () => { this.sent = ''; this.send() } })),
          h('p', { className: 'ia-heroprev-note' }, 'Changes show here as you make them. Visitors see them once you press Save and the site has rebuilt.'))
      },
    }))
  }

  /* ---------- a print as a profile picture: where the circle sits, and how far in ----------
     The piece's picture in a circle: drag it to put the face in place, zoom with the slider (the
     sliders under it move it too, for the keyboard). Kept as "left,top,zoom" (percent), which the
     site uses wherever a buyer shows this print as their picture. */
  if (window.CMS && window.createClass && window.h) {
    const h = window.h
    const clamp = (n, lo, hi) => Math.round(Math.min(hi, Math.max(lo, n)))
    window.CMS.registerWidget('facecrop', window.createClass({
      getInitialState() { return { src: '' } },
      componentDidMount() { this.look(); this.timer = setInterval(() => this.look(), 400) },
      componentWillUnmount() { clearInterval(this.timer) },
      // the picture is whatever the form's Picture field holds right now
      look() {
        let src = ''
        // inside a list (the free profile pictures): the picture chosen in the same tile
        const tile = this.root && this.root.closest('[class*="-listControlItem"]')
        if (tile) {
          const img = tile.querySelector('[class*="ImageWrapper"] img')
          src = img ? img.getAttribute('src') || '' : ''
        } else {
          // a piece: the form's Picture field
          const entry = this.props.getEntry && this.props.getEntry()
          const data = entry && entry.get('data')
          const path = data && data.get('src')
          src = path ? String(this.props.getAsset(path) || '') : ''
        }
        if (src !== this.state.src) this.setState({ src })
      },
      parts() {
        const [x, y, z] = String(this.props.value || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n)))
        return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 22, z: Number.isFinite(z) && z >= 100 ? z : 100 }
      },
      put(p) { this.props.onChange(clamp(p.x, 0, 100) + ',' + clamp(p.y, 0, 100) + ',' + clamp(p.z, 100, 400)) },
      drag(e) {
        if (!this.state.src) return
        e.preventDefault()
        const box = e.currentTarget.getBoundingClientRect()
        const from = { mx: e.clientX, my: e.clientY, ...this.parts() }
        const per = 200 / (box.width * (from.z / 100)) // how far one pixel of dragging moves the picture
        const move = (m) => this.put({ x: from.x - (m.clientX - from.mx) * per, y: from.y - (m.clientY - from.my) * per, z: from.z })
        const stop = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', stop) }
        addEventListener('pointermove', move)
        addEventListener('pointerup', stop)
      },
      render() {
        const { x, y, z } = this.parts()
        const src = this.state.src
        const look = { objectPosition: x + '% ' + y + '%', transform: 'scale(' + (z / 100) + ')', transformOrigin: x + '% ' + y + '%' }
        const circle = (size) => h('span', { className: 'ia-face is-' + size }, src ? h('img', { src, alt: '', draggable: false, style: look }) : null)
        const now = { x, y, z }
        const slider = (label, key, min, max) => h('label', { className: 'ia-face-slider' },
          h('span', {}, label),
          h('input', { type: 'range', min, max, step: 1, value: now[key], disabled: !src, onChange: (e) => this.put({ ...now, [key]: Number(e.target.value) }) }),
          h('b', {}, now[key] + '%'))
        return h('div', { className: 'ia-facecrop', ref: (el) => { this.root = el } },
          h('div', { className: 'ia-face-drag' + (src ? '' : ' is-empty'), onPointerDown: (e) => this.drag(e), title: src ? 'Drag to move the picture' : '' },
            circle('big'),
            src ? null : h('span', { className: 'ia-face-none' }, 'Add the picture first')),
          h('div', { className: 'ia-face-side' },
            h('div', { className: 'ia-face-row' }, circle('mid'), circle('small'), h('span', {}, 'As it shows on their profile')),
            slider('Zoom', 'z', 100, 400),
            slider('Left to right', 'x', 0, 100),
            slider('Up and down', 'y', 0, 100),
            h('button', { type: 'button', className: 'ia-face-reset', disabled: !this.props.value, onClick: () => this.props.onChange('') }, 'Start again')))
      },
    }))
  }

  /* ---------- asking before a reward (or a free profile picture) is removed ----------
     The × on an item of these lists removes it at once; here it asks first, in a window. Yes
     removes it (nothing changes on the site until the form is saved); No, Escape or a click
     outside keeps it. */
  const ASK_BEFORE_REMOVING = {
    pictures: { what: 'profile picture', text: 'Customers who earned it lose it, and anyone using it as their picture goes back to their initials. To stop offering it for now without losing it, switch on "Hide (not offered for now)" instead.' },
    cards: { what: 'card design', text: 'Customers who earned it lose it, and anyone using it goes back to the usual card. To stop offering it for now without losing it, switch on "Hide (not offered for now)" instead.' },
    discounts: { what: 'discount', text: 'Customers no longer earn it. Codes already made from it keep working until they run out. To stop offering it for now without losing it, switch on "Hide (not offered for now)" instead.' },
    rewards: { what: 'reward', text: 'Customers who earned it lose it: a picture or card design they chose goes back to the usual one, and they no longer see it under Rewards. Discount codes already made from it keep working until they run out. To stop offering it for now without losing it, switch on "Hide (not offered for now)" instead.' },
    icons: { what: 'free picture', text: 'Customers using it as their profile picture go back to their initials.' },
  }
  let removing = false // the confirmed click passes straight through
  const askRemove = (kind, name, onYes) => {
    const back = el('div', { className: 'io-modal-back' })
    const close = () => { back.remove(); removeEventListener('keydown', esc, true) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    const no = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Keep it' })
    const yes = el('button', { type: 'button', className: 'ia-btn io-danger', textContent: `Delete ${kind.what}` })
    no.addEventListener('click', close)
    yes.addEventListener('click', () => { close(); onYes() })
    back.addEventListener('click', (e) => { if (e.target === back) close() })
    back.append(el('div', { className: 'io-modal', role: 'alertdialog', ariaModal: 'true', ariaLabel: `Delete ${kind.what}` }, [
      el('header', { className: 'io-modal-head' }, [el('h2', { textContent: name ? `Delete “${name}”?` : `Delete this ${kind.what}?` })]),
      el('div', { className: 'io-modal-body' }, [
        el('p', { textContent: 'It is taken off the list. Nothing changes on the site until you press Save.' }),
        el('p', { textContent: kind.text }),
      ]),
      el('footer', { className: 'io-modal-foot' }, [no, yes]),
    ]))
    document.body.append(back)
    addEventListener('keydown', esc, true)
    setTimeout(() => no.focus(), 30)
  }
  document.addEventListener('click', (e) => {
    if (removing) return
    const btn = e.target.closest && e.target.closest('button')
    const bar = btn && btn.parentElement
    if (!bar || !/ListItemTopBar/.test(String(bar.className)) || bar.lastElementChild !== btn) return // the × is the last button of an item's top bar
    let list = null
    for (let f = btn.closest('[class*="ControlContainer"]'); f; f = f.parentElement && f.parentElement.closest('[class*="ControlContainer"]')) {
      const name = ((f.querySelector(':scope > [class*="ControlTopbar"] label[for]') || {}).htmlFor || '').replace(/-field-\d+$/, '')
      if (ASK_BEFORE_REMOVING[name]) { list = name; break }
    }
    if (!list) return // only the lists named above
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
    const item = btn.closest('[class*="-listControlItem"]')
    const named = item && [...item.querySelectorAll('input[type="text"], input:not([type])')].find((i) => /^name-field/.test(i.id || ''))
    const label = (named && named.value) || (item && (item.querySelector('[class*="ListItemTopBar"]') || {}).textContent) || ''
    askRemove(ASK_BEFORE_REMOVING[list], String(label).trim(), () => { removing = true; try { btn.click() } finally { removing = false } })
  }, true)

  /* ---------- a membership card design, as customers will see it ----------
     Under each card design (Shop → Rewards): the card in its look, with its picture, redrawn as they
     change. With a picture across the card, it is placed here as a profile picture is: drag it on the
     card, or use the sliders (zoom, left to right, up and down). Kept as "x,y,zoom" (cardCrop); the
     member card on the site draws the picture from it. */
  if (window.CMS && window.createClass && window.h) {
    const h = window.h
    const LOOKS = [['ink', /^ink/i], ['gold', /^gold/i], ['chrome', /^chrome/i], ['art', /picture/i]]
    const clamp = (n, lo, hi) => Math.round(Math.min(hi, Math.max(lo, n)))
    window.CMS.registerWidget('cardpreview', window.createClass({
      getInitialState() { return { look: 'ink', art: '', name: '' } },
      componentDidMount() { this.read(); this.timer = setInterval(() => this.read(), 400) },
      componentWillUnmount() { clearInterval(this.timer) },
      read() {
        const item = this.root && this.root.closest('[class*="-listControlItem"]')
        if (!item) return
        const said = [...item.querySelectorAll('[class*="singleValue"]')].map((n) => n.textContent)
        const found = LOOKS.find(([, re]) => said.some((t) => re.test(t)))
        const img = item.querySelector('[class*="ImageWrapper"] img')
        const name = (item.querySelector('input[id^="name-field"]') || {}).value || ''
        const next = { look: found ? found[0] : 'ink', art: img ? img.getAttribute('src') || '' : '', name }
        if (next.look !== this.state.look || next.art !== this.state.art || next.name !== this.state.name) this.setState(next)
      },
      // where the picture sits: x and y in % (50, 25: the middle, a little above), zoom in % (100 = fills the card)
      parts() {
        const [x, y, z] = String(this.props.value || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n)))
        return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 25, z: Number.isFinite(z) && z >= 100 ? z : 100 }
      },
      put(p) { this.props.onChange(clamp(p.x, 0, 100) + ',' + clamp(p.y, 0, 100) + ',' + clamp(p.z, 100, 400)) },
      drag(e) {
        if (!this.state.art) return
        e.preventDefault()
        const box = e.currentTarget.getBoundingClientRect()
        const from = { mx: e.clientX, my: e.clientY, ...this.parts() }
        const per = 200 / (box.width * (from.z / 100)) // how far one pixel of dragging moves the picture
        const move = (m) => this.put({ x: from.x - (m.clientX - from.mx) * per, y: from.y - (m.clientY - from.my) * per * 1.586, z: from.z })
        const stop = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', stop) }
        addEventListener('pointermove', move)
        addEventListener('pointerup', stop)
      },
      render() {
        const { look, art, name } = this.state
        const now = this.parts()
        const style = art ? { '--card-art': 'url("' + art + '")', '--art-x': now.x + '%', '--art-y': now.y + '%', '--art-z': String(now.z / 100) } : {}
        const slider = (label, key, min, max) => h('label', { className: 'ia-face-slider' },
          h('span', {}, label),
          h('input', { type: 'range', min, max, step: 1, value: now[key], onChange: (e) => this.put({ ...now, [key]: Number(e.target.value) }) }),
          h('b', {}, now[key] + '%'))
        return h('div', { className: 'ia-cardprev-wrap', ref: (el) => { this.root = el } },
          h('div', { className: 'ia-cardprev-row' },
            h('div', { className: 'ia-cardprev is-' + look + (art ? ' has-art is-movable' : ''), style, onPointerDown: art ? (e) => this.drag(e) : undefined, title: art ? 'Drag to move the picture' : '' },
              h('span', { className: 'ia-cardprev-mark' }, 'J'),
              h('span', { className: 'ia-cardprev-top' }, h('b', {}, 'JBEATS', h('i', {}, 'ART')), h('em', {}, 'Collector')),
              h('span', { className: 'ia-cardprev-chip' }),
              h('strong', { className: 'ia-cardprev-name' }, 'Your name here'),
              h('span', { className: 'ia-cardprev-foot' }, h('small', {}, 'Member no.'), ' #0001')),
            art ? h('div', { className: 'ia-face-side' },
              slider('Zoom', 'z', 100, 400),
              slider('Left to right', 'x', 0, 100),
              slider('Up and down', 'y', 0, 100),
              h('button', { type: 'button', className: 'ia-face-reset', disabled: !this.props.value, onClick: () => this.props.onChange('') }, 'Start again')) : null),
          h('p', { className: 'ia-cardprev-note' }, look === 'art' && !art
            ? 'Add a picture above to see the card.'
            : art ? '“' + (name || 'This design') + '”, as customers will see it. Drag the picture on the card, or use the sliders, to choose what shows.'
              : '“' + (name || 'This design') + '”, as customers will see it. Add a picture above to put one across the card.'))
      },
    }))
  }

  /* ---------- a sale shows only the list it covers ----------
     Shop → Sales: "What it covers" picks everything, a category, a type or a universe; of the three
     lists under it, only the one it names is shown. Read from the page every moment, so it follows
     the choice as it changes; anything it cannot read stays shown. */
  const COVER_WORDS = [['all', /^Everything/i], ['category', /^One category/i], ['type', /^One type/i], ['universe', /^One universe/i]]
  setInterval(() => {
    if (currentFile() !== 'sales') return
    document.querySelectorAll('[class*="-listControlItem"]').forEach((item) => {
      const said = [...item.querySelectorAll('[class*="singleValue"]')].map((n) => n.textContent)
      const found = COVER_WORDS.find(([, re]) => said.some((t) => re.test(t)))
      for (const name of ['category', 'type', 'universe']) {
        const label = item.querySelector(`label[for^="${name}-field"]`)
        const box = label && label.closest('[class*="ControlContainer"]')
        if (box) box.style.display = !found || found[0] === name ? '' : 'none'
      }
    })
  }, 400)
})()
