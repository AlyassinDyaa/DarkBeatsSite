/* DarkBeats admin shell.
   Decap CMS renders the editing screens; this adds what makes them easy to get around:
   1. a left navigation that never goes away, with a Home screen of big section tiles;
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
     sit three to a row. Field names are the ones in config.yml. */
  const LAYOUT = {
    work: { groups: { title: 'Piece', src: 'Picture', hue: 'Colour', featured: 'Where it appears' }, half: ['title', 'category', 'date', 'link', 'featured', 'hidden'] },
    gallery_sections: { groups: { title: 'Section', from: 'Pictures', hidden: 'Advanced' }, half: ['title', 'order'] },
    redraws: { groups: { title: 'Set', stages: 'The drawings, oldest first', order: 'Advanced' }, half: ['title', 'link', 'order', 'hidden'] },
    events: { groups: { name: 'Event', order: 'Advanced' }, half: ['name', 'role', 'place', 'when', 'order', 'hidden'] },
    settings: { groups: {}, half: [], inner: ['work', 'gallery', 'commissions', 'about', 'contact', 'ticker', 'latest', 'redraws', 'events'] },
  }

  // ---------- read the sections out of config.yml ----------
  const readSections = async () => {
    const cfg = (await (await fetch('config.yml')).text()).replace(/\r\n/g, '\n')
    const body = cfg.slice(cfg.indexOf('\ncollections:'))
    return body.split(/\n {2}- name: /).slice(1).map((block) => {
      const pick = (key) => ((block.match(new RegExp(`^ {4}${key}: (.+)$`, 'm')) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '')
      const name = block.split('\n')[0].trim()
      const file = (block.match(/^ {4}files:\n {6}- name: (\S+)/m) || [])[1]
      return { name, label: pick('label'), singular: pick('label_singular') || pick('label'), description: pick('description'), file, canAdd: /^ {4}create: true$/m.test(block) }
    })
  }

  const openMedia = (tries = 0) => {
    const btn = [...document.querySelectorAll('header button')].find((b) => /media/i.test(b.textContent))
    if (btn) return btn.click()
    if (tries === 0) location.hash = '#/collections/work'
    if (tries < 30) setTimeout(() => openMedia(tries + 1), 150)
  }

  const build = async () => {
    const sections = await readSections()
    const hrefOf = (s) => (s.file ? `#/collections/${s.name}/entries/${s.file}` : `#/collections/${s.name}`)

    // ---- left navigation
    const search = el('input', { type: 'search', placeholder: 'Search everything', ariaLabel: 'Search everything' })
    const form = el('form', { className: 'ia-search' }, [search])
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const q = search.value.trim()
      if (q) location.hash = `#/search/${encodeURIComponent(q)}`
    })
    const home = el('a', { href: HOME, className: 'ia-home-link' }, [icon('home'), 'Home'])
    const links = sections.map((s) => Object.assign(el('a', { href: hrefOf(s) }, [icon(s.name), s.label]), { section: s.name }))
    const media = el('button', { type: 'button' }, [icon('pictures'), 'Pictures'])
    // Sign out: forget this browser's login and show the login page again. (Unsaved changes on
    // an open form still get the browser's "leave this page?" question first.)
    const out = el('button', { type: 'button' }, [icon('signout'), 'Sign out'])
    out.addEventListener('click', () => {
      try { if (window.netlifyIdentity && window.netlifyIdentity.currentUser()) window.netlifyIdentity.logout() } catch { /* not that kind of login */ }
      try { localStorage.removeItem('decap-cms-user') } catch { /* nothing stored */ }
      location.hash = '#/'
      location.reload()
    })
    media.addEventListener('click', () => openMedia())
    const side = el('aside', { className: 'ia-side' }, [
      el('a', { className: 'ia-brand', href: HOME }, [el('img', { src: '../favicon.svg', alt: '' }), el('span', {}, [el('strong', { textContent: 'DarkBeats' }), el('small', { textContent: 'Admin' })])]),
      form,
      el('nav', { ariaLabel: 'Admin' }, [home]),
      el('div', { className: 'ia-label', textContent: 'Edit the site' }),
      el('nav', { ariaLabel: 'Sections' }, links),
      el('div', { className: 'ia-label', textContent: 'Library' }),
      el('nav', {}, [media]),
      el('div', { className: 'ia-foot' }, [
        el('a', { className: 'ia-site', href: '../', target: '_blank', rel: 'noopener', textContent: 'View the site ↗' }),
        el('nav', { ariaLabel: 'Account' }, [out]),
      ]),
    ])

    // ---- home screen
    const tiles = sections.map((s) => el('div', { className: 'ia-tile' }, [
      el('div', { className: 'ia-tile-icon' }, [icon(s.name)]),
      el('h2', { textContent: s.label }),
      el('p', { textContent: s.description }),
      el('div', { className: 'ia-tile-actions' }, [
        el('a', { className: 'ia-btn', href: hrefOf(s), textContent: s.file ? 'Open' : 'See all' }),
        s.canAdd ? el('a', { className: 'ia-btn ghost', href: `#/collections/${s.name}/new`, textContent: `+ New ${s.singular.toLowerCase()}` }) : null,
      ]),
    ]))
    const mediaTile = el('div', { className: 'ia-tile' }, [el('div', { className: 'ia-tile-icon' }, [icon('pictures')]), el('h2', { textContent: 'Pictures' }), el('p', { textContent: 'Every picture uploaded to the site. Upload new ones or remove old ones.' }), el('div', { className: 'ia-tile-actions' }, [(() => { const b = el('button', { type: 'button', className: 'ia-btn', textContent: 'Open the library' }); b.addEventListener('click', () => openMedia()); return b })()])])
    const homeScreen = el('main', { className: 'ia-home' }, [
      el('div', { className: 'ia-home-inner' }, [
        el('div', { className: 'ia-kicker', textContent: 'DarkBeats admin' }),
        el('h1', { textContent: 'What do you want to update?' }),
        el('p', { className: 'ia-lead', textContent: 'Pick a part of the site. Changes go live when you press Save.' }),
        el('div', { className: 'ia-tiles' }, [...tiles, mediaTile]),
      ]),
    ])
    document.body.append(side, homeScreen)

    const sync = () => {
      const onHome = location.hash === HOME
      document.documentElement.toggleAttribute('data-ia-home', onHome)
      home.classList.toggle('on', onHome)
      links.forEach((a) => a.classList.toggle('on', !onHome && a.section === currentSection()))
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
     (for instance clicking "Site settings" while a comic is open) keeps the editor open and
     would show the first entry's values in the second entry's form. So such a jump goes by way
     of the section list, which closes the editor first; anything else (back/forward buttons)
     falls back to a clean reload. */
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
    location.hash = `#/collections/${currentSection()}` // Decap asks first if there are unsaved changes
    let tries = 0
    const go = setInterval(() => {
      if (!editorOpen()) { clearInterval(go); location.hash = target; setTimeout(() => { steering = false }, 300) }
      else if (++tries > 40) { clearInterval(go); steering = false } // the admin chose to stay
    }, 50)
  }, true)
  addEventListener('hashchange', (e) => {
    const from = new URL(e.oldURL).hash, to = new URL(e.newURL).hash
    const saved = /^#\/collections\/[^/]+\/new/.test(from) && /\/entries\//.test(to) // a new entry getting its address
    // (moving on to a brand-new entry is fine: Decap starts that one empty by itself)
    if (!steering && !saved && isEntry(from) && /\/entries\//.test(to) && from !== to) location.reload()
  })

  // ---------- form layout: tag fields so the stylesheet can group and pair them ----------
  const tagFields = () => {
    const layout = LAYOUT[currentSection()]
    const pane = document.querySelector('[class*="ControlPaneContainer"]:not([class*="PreviewPaneContainer"])')
    if (!pane) return
    for (const field of pane.children) {
      const name = ((field.querySelector(':scope > [class*="ControlTopbar"] label[for], :scope > label[for]') || {}).htmlFor || '').replace(/-field-\d+$/, '')
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
  let tagTimer
  const scheduleTag = () => { clearTimeout(tagTimer); tagTimer = setTimeout(() => { tagFields(); syncViews() }, 60) }

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
    if (section && /^#\/collections\/[^/]+\/(new|entries)/.test(location.hash)) location.hash = `#/collections/${section}`
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
  const plainFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const answer = await plainFetch(...args)
    try {
      const where = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''
      const how = String((args[1] && args[1].method) || (args[0] && args[0].method) || 'GET').toUpperCase()
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
})()
