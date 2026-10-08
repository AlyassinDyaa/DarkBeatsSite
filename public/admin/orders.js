/* JBeatsArt admin: the Orders and Customers screens (#/orders, #/customers), reached from their
   own place at the foot of the left navigation, under a divider, and from the Overview.
   Orders lists what has been paid through Stripe (prints from the Shop, and support), with
   filters, sorting and a download, and keeps track of posting each order: packed, shipped (with
   the carrier and tracking number), delivered. Customers gathers those orders by buyer: who has
   bought, how often and how much, and who has given support. The orders and the tracking live in
   Stripe; api/orders.js reads and writes them for the logged-in admin. Nothing about a buyer is
   kept anywhere else. */
(() => {
  const ROUTE = '#/orders'
  const CROUTE = '#/customers'
  const DROUTE = '#/discounts'
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props)
    kids.forEach((k) => k != null && k !== false && n.append(k))
    return n
  }
  const svg = (d) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v)
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', d); s.append(p)
    return s
  }
  const BOX = 'M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8'
  const PEOPLE = 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20v-.5A5.5 5.5 0 0 1 8 14h2a5.5 5.5 0 0 1 5.5 5.5v.5 M16 4.300a3.500 3.500 0 0 1 0 6.400 M18 14.200a5.500 5.500 0 0 1 3.500 5.300v.5'

  const STATUS = { new: 'To post', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' }
  const CARRIERS = {
    auspost: ['Australia Post', (n) => `https://auspost.com.au/mypost/track/details/${n}`],
    startrack: ['StarTrack', (n) => `https://startrack.com.au/track/details/${n}`],
    sendle: ['Sendle', (n) => `https://track.sendle.com/tracking?ref=${n}`],
    aramex: ['Aramex', (n) => `https://www.aramex.com.au/tools/track?l=${n}`],
    couriersplease: ['CouriersPlease', (n) => `https://www.couriersplease.com.au/tools-track/no/${n}`],
    dhl: ['DHL', (n) => `https://www.dhl.com/au-en/home/tracking.html?tracking-id=${n}`],
    other: ['Another carrier', null],
  }
  const VIEWS = [
    ['all', 'All'],
    ['topost', 'To post'],
    ['shipped', 'Shipped'],
    ['delivered', 'Delivered'],
    ['support', 'Support'],
    ['refunded', 'Refunded'],
  ]
  const PERIODS = [['all', 'Any time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year']]
  const SORTS = [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Highest amount'], ['low', 'Lowest amount'], ['name', 'Name A–Z']]
  const CVIEWS = [['all', 'Everyone'], ['members', 'Members'], ['buyers', 'Buyers'], ['repeat', 'Bought more than once'], ['supporters', 'Supporters'], ['waiting', 'Waiting for a parcel']]
  const CSORTS = [['recent', 'Most recent'], ['spent', 'Spent the most'], ['orders', 'Most orders'], ['name', 'Name A–Z'], ['first', 'Customer the longest']]
  const DAY = 864e5
  const TAG = 'M3 12V4h8l10 10-8 8z M7.500 8.500h.01'
  const CARD = 'M3 5h18v14H3z M8.500 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M5.500 16a3 3 0 0 1 6 0 M14 9h4 M14 12h4 M14 15h2'
  const TRASH = 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6'
  const PICTURE = 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.500 9.500a1.500 1.500 0 1 0 0-.010'
  const CROSS = 'M6 6l12 12 M18 6L6 18'
  const PAGE_SIZES = [10, 15, 20, 50]
  const DVIEWS = [['active', 'Active'], ['usedup', 'Used up'], ['ended', 'Ended'], ['off', 'Switched off'], ['all', 'All']]
  const DSORTS = [['new', 'Newest first'], ['ending', 'Ending soonest'], ['big', 'Biggest discount'], ['used', 'Most used']]
  const LENGTHS = [['7', '1 week'], ['14', '2 weeks'], ['30', '1 month'], ['90', '3 months'], ['180', '6 months'], ['date', 'Until a date…'], ['none', 'No end date']]
  const USES = [['1', 'Once'], ['3', '3 times'], ['10', '10 times'], ['', 'No limit']]

  const people = { q: '', view: 'all', sort: 'recent', open: new Set() }
  const state = { orders: [], more: false, next: null, loaded: false, loading: false, problem: null, view: 'topost', q: '', period: 'all', sort: 'new', open: new Set(), keep: new Set(), drafts: {}, saving: {}, saved: {}, pieces: new Set() }

  const pass = () => { try { return JSON.parse(localStorage.getItem('decap-cms-user') || '{}').token || '' } catch { return '' } }
  const realAsk = async (url, init = {}) => {
    const answer = await fetch(url, { ...init, headers: { Authorization: `Bearer ${pass()}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
    const said = await answer.json().catch(() => ({}))
    return { ok: answer.ok, status: answer.status, said }
  }

  const ask = (url, init = {}) => (sampleMode ? fakeAsk(url, init) : realAsk(url, init))

  // ---------- sample data (Site → Show / hide → Admin): made-up orders, customers and discount
  // codes, so every screen can be tried before real orders exist. The screens talk to a stand-in
  // instead of Stripe while it is on; changes to the samples last until the page is reloaded.
  let sampleMode = false
  const makeSamples = () => {
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    const pick = (list) => list[Math.floor(rnd() * list.length)]
    const people = [
      ['Mia Thompson', '14 Ocean Pde', 'Burleigh Heads', 'QLD', '4220', 'AU'], ['Sam Nguyen', '3/88 King St', 'Newtown', 'NSW', '2042', 'AU'],
      ['Jordan Lee', '7 Rata St', 'Wellington', 'Wellington', '6011', 'NZ'], ['Priya Shah', '201 Flinders Ln', 'Melbourne', 'VIC', '3000', 'AU'],
      ['Chris Walker', '55 Hay St', 'Perth', 'WA', '6000', 'AU'], ['Ella Martin', '9 Jacaranda Ave', 'Southport', 'QLD', '4215', 'AU'],
      ['Liam O’Brien', '42 Rundle St', 'Kent Town', 'SA', '5067', 'AU'], ['Zoe Chen', '18 Hobart Rd', 'South Launceston', 'TAS', '7249', 'AU'],
      ['Noah Williams', '6 Smith St', 'Darwin', 'NT', '0800', 'AU'], ['Ava Brown', '120 Queen St', 'Brisbane', 'QLD', '4000', 'AU'],
      ['Lucas Garcia', '33 Bourke St', 'Surry Hills', 'NSW', '2010', 'AU'], ['Grace Kim', '2 Marine Pde', 'Coolangatta', 'QLD', '4225', 'AU'],
      ['Ethan Davis', '77 Cuba St', 'Te Aro', 'Wellington', '6011', 'NZ'], ['Isla Wilson', '15 Lygon St', 'Carlton', 'VIC', '3053', 'AU'],
    ]
    const prints = [['The Rider · A2', 65], ['The Rider · A3', 40], ['Brand New Day', 34], ['Lethal Protector · A3', 40], ['Man of Steel', 50], ['Imposter', 40], ['The Devils Mark', 50], ['Born Again', 40], ['Ghost Face', 45], ['Space Kook', 40], ['Neon Rain', 40], ['What’s Up Danger', 40]]
    const now = Math.floor(Date.now() / 1000)
    const orders = []
    for (let n = 1; n <= 34; n++) {
      const [name, line1, city, st, pc, country] = n <= 4 ? people[n - 1] : pick(people)
      const email = `${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.${name.split(' ')[1].toLowerCase().replace(/[^a-z]/g, '')}@example.com`
      const age = n <= 3 ? n * 0.4 : Math.floor(rnd() * 120) + 1
      const created = now - Math.round(age * 86400)
      const support = rnd() < 0.18
      let items, amount, discount = 0
      if (support) {
        const give = pick([5, 5, 10, 15, 25])
        items = [{ name: give === 5 ? 'Support: a coffee' : 'Support: your own amount', qty: 1, amount: give }]
        amount = give
      } else {
        items = Array.from({ length: rnd() < 0.3 ? 2 : 1 }, () => { const [t, p] = pick(prints); const signed = rnd() < 0.5; const qty = rnd() < 0.15 ? 2 : 1; return { name: `${t} (${signed ? 'signed' : 'unsigned'})`, qty, amount: (p + (signed ? 10 : 0)) * qty } })
        amount = items.reduce((t, i) => t + i.amount, 0)
        if (rnd() < 0.2) { discount = Math.round(amount * 0.1); amount -= discount }
      }
      const refundedAll = !support && rnd() < 0.06
      const status = support ? 'new' : age < 2 ? 'new' : age < 5 ? pick(['new', 'packed']) : age < 12 ? pick(['shipped', 'packed', 'shipped']) : pick(['delivered', 'delivered', 'shipped'])
      const carrier = ['shipped', 'delivered'].includes(status) ? pick(['auspost', 'auspost', 'sendle', 'startrack']) : ''
      orders.push({
        id: `cs_test_sample${n}`, pi: `pi_sample${n}`, created, kind: support ? 'support' : 'shop', amount, discount, currency: 'AUD', paid: true,
        refunded: refundedAll ? amount : 0, fullyRefunded: refundedAll, name, email, phone: rnd() < 0.3 ? `04${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}` : '',
        address: support ? null : { name, line1, line2: '', city, state: st, postal_code: pc, country },
        items, receipt: '', stripe: '', test: true, sample: true, hidden: false,
        track: { status, carrier, number: carrier ? `${carrier === 'sendle' ? 'SNDL' : '33AB'}${String(Math.floor(rnd() * 1e7)).padStart(7, '0')}` : '', note: '', at: carrier ? new Date((created + 2 * 86400) * 1000).toISOString() : '' },
      })
    }
    const code = (id, c, percent, email, name, days, uses, used, active = true) => ({ id, code: c, active, percent, until: days === null ? null : now + days * 86400, uses, used, email, name, label: `${percent}% off`, batch: '', created: now - Math.abs(days || 30) * 3600, test: true })
    const codes = [
      code('promo_s1', 'WELCOME10', 10, '', '', null, null, 6),
      code('promo_s2', 'SPOOKY20', 20, '', '', 24, 50, 3),
      code('promo_s3', 'JB-MIA-7K3Q', 15, 'mia.thompson@example.com', 'Mia Thompson', 20, 1, 0),
      code('promo_s4', 'JB-SAM-4D2P', 15, 'sam.nguyen@example.com', 'Sam Nguyen', 20, 1, 1),
      code('promo_s5', 'JB-ELLA-9QWE', 25, 'ella.martin@example.com', 'Ella Martin', -3, 1, 0),
      code('promo_s6', 'GOLDCOAST15', 15, '', '', 60, null, 2, false),
    ]
    return { orders, codes }
  }
  let samples = null
  const fakeAsk = async (url, init = {}) => {
    samples = samples || makeSamples()
    await new Promise((r) => setTimeout(r, 250)) // a moment, as a real answer would take
    const body = init.body ? JSON.parse(init.body) : {}
    const done = (said) => ({ ok: true, status: 200, said })
    const ts = Math.floor(Date.now() / 1000)
    if (url.startsWith('/api/members')) return done({ members: [], rewards: [] })
    if (url.startsWith('/api/orders')) {
      if (!init.method || init.method === 'GET') return done({ orders: samples.orders.filter((o) => !o.hidden).map((o) => ({ ...o, track: { ...o.track } })), more: false, next: null })
      if (body.action === 'hide') { samples.orders.forEach((o) => { if ((body.pis || []).includes(o.pi)) o.hidden = true }); return done({ hidden: body.pis || [] }) }
      const o = samples.orders.find((x) => x.id === body.id)
      o.track = { status: body.status, carrier: body.carrier || '', number: body.number || '', note: body.note || '', at: new Date().toISOString() }
      return done({ track: { ...o.track } })
    }
    if (url.startsWith('/api/discounts')) {
      if (!init.method || init.method === 'GET') return done({ discounts: samples.codes.filter((d) => !d.hidden).map((d) => ({ ...d })) })
      if (body.action === 'delete') { samples.codes.forEach((d) => { if (body.ids.includes(d.id)) { d.hidden = true; d.active = false } }); return done({ deleted: body.ids }) }
      if (body.action === 'email') { const d = samples.codes.find((x) => x.id === body.id); d.sent = new Date().toISOString(); return done({ discount: { ...d } }) }
      if (body.action === 'stop') { const d = samples.codes.find((x) => x.id === body.id); d.active = false; return done({ discount: { ...d } }) }
      if (body.action === 'create') {
        const tail = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
        const made = (body.people || [{ email: '', name: '' }]).map((p, i) => ({ id: `promo_new${ts}${i}`, code: body.people ? `JB-${((p.name || p.email).split(/[\s@._-]+/)[0] || 'X').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}-${tail()}` : body.code, active: true, percent: Number(body.percent), until: body.until || null, uses: body.uses ? Number(body.uses) : null, used: 0, email: p.email, name: p.name, label: body.label || `${body.percent}% off`, batch: '', created: ts, test: true }))
        samples.codes.unshift(...made)
        return done({ discounts: made.map((d) => ({ ...d })), failed: [] })
      }
    }
    return { ok: false, status: 400, said: { message: 'Not part of the samples.' } }
  }
  // the switch is read from the site's settings (the repository on the live admin, the file here)
  const readSamples = async () => {
    let v = null
    try {
      const b = await (await fetch('backend.json', { cache: 'no-store' })).json()
      if (b && b.repo) {
        const r = await realAsk(`/api/gh/repos/${b.repo}/contents/content/site/visibility.json?ref=${encodeURIComponent(b.branch || 'main')}&t=${Date.now()}`)
        if (r.ok && r.said.content) v = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(r.said.content.replace(/\s/g, '')), (c) => c.charCodeAt(0))))
      }
    } catch { /* not on Vercel */ }
    if (!v) { try { v = await (await fetch('/content/site/visibility.json', { cache: 'no-store' })).json() } catch { /* no settings to read */ } }
    return Boolean(v && v.admin && v.admin.samples)
  }
  let lastRead = 0
  const checkSamples = async (force) => {
    if (!force && Date.now() - lastRead < 8000) return
    lastRead = Date.now()
    const on = await readSamples()
    if (on === sampleMode) return
    sampleMode = on
    samples = null
    // start again from the right source
    state.orders = []; state.loaded = false; state.problem = null; state.open.clear(); state.keep.clear(); state.drafts = {}
    disc.list = []; disc.loaded = false; disc.problem = null; disc.result = null
    sampleNotes.forEach((n) => { n.hidden = !sampleMode })
    load(true)
    if (location.hash === DROUTE) loadDiscounts()
  }
  const sampleNotes = []
  const sampleNote = () => {
    const n = el('div', { className: 'io-sample', hidden: true }, [
      el('strong', { textContent: 'Sample data' }),
      el('span', { textContent: 'Made-up orders, customers and codes, to try things out. Nothing here is real or reaches Stripe, and changes last until the page reloads. Switch it off under Site → Show / hide → Admin before going live.' }),
    ])
    sampleNotes.push(n)
    return n
  }

  const money = (n, code) => {
    try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: code || 'AUD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n) } catch { return `${n} ${code}` }
  }
  const when = (secs, long) => new Date(secs * 1000).toLocaleDateString('en-AU', long ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short' })
  const country = (code) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code } catch { return code } }
  const addressLines = (a) => !a ? [] : [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country && a.country !== 'AU' ? country(a.country) : ''].filter(Boolean)
  const trackUrl = (t) => { const c = CARRIERS[t.carrier]; return c && c[1] && t.number ? c[1](encodeURIComponent(t.number)) : '' }
  const shippable = (o) => o.kind === 'shop' && !o.fullyRefunded
  const label = (o) => (o.fullyRefunded ? ['refunded', 'Refunded'] : o.kind === 'support' ? ['support', 'Support'] : o.kind === 'other' ? ['other', 'Payment'] : [o.track.status, STATUS[o.track.status]])

  const inView = (o, view) => view === 'all'
    || (view === 'topost' && shippable(o) && ['new', 'packed'].includes(o.track.status))
    || (view === 'shipped' && shippable(o) && o.track.status === 'shipped')
    || (view === 'delivered' && shippable(o) && o.track.status === 'delivered')
    || (view === 'support' && o.kind === 'support')
    || (view === 'refunded' && o.refunded > 0)
  const inPeriod = (o) => {
    if (state.period === 'all') return true
    if (state.period === 'year') return new Date(o.created * 1000).getFullYear() === new Date().getFullYear()
    return o.created * 1000 > Date.now() - Number(state.period) * 864e5
  }
  const matches = (o) => {
    const q = state.q.trim().toLowerCase()
    if (!q) return true
    return [o.name, o.email, o.phone, o.id, o.track.number, ...o.items.map((i) => i.name), ...addressLines(o.address)].join(' ').toLowerCase().includes(q)
  }

  // ---------- pages: a long list shows 10, 15, 20 or 50 at a time (the choice is remembered here)
  const opager = el('nav', { className: 'io-pager', ariaLabel: 'Pages of orders' })
  const cpager = el('nav', { className: 'io-pager', ariaLabel: 'Pages of customers' })
  const dpager = el('nav', { className: 'io-pager', ariaLabel: 'Pages of discount codes' })
  const pages = {}
  let perPage = (() => { try { return PAGE_SIZES.includes(Number(localStorage.getItem('jb.admin.perPage'))) ? Number(localStorage.getItem('jb.admin.perPage')) : 15 } catch { return 15 } })()
  // `sig` names the filters in force: when they change, the list starts again at page 1
  const paged = (name, items, sig, bar, repaint) => {
    const p = pages[name] || (pages[name] = { page: 1, sig })
    if (p.sig !== sig) { p.sig = sig; p.page = 1 }
    const count = Math.max(1, Math.ceil(items.length / perPage))
    p.page = Math.min(Math.max(1, p.page), count)
    const from = (p.page - 1) * perPage
    if (items.length <= PAGE_SIZES[0]) { bar.replaceChildren(); return items }
    const go = (n) => { p.page = n; repaint(); bar.previousElementSibling?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }
    const btn = (label, n, on, aria) => {
      const b = el('button', { type: 'button', className: `io-page ${on ? 'on' : ''}`, textContent: label, disabled: n < 1 || n > count, ariaLabel: aria || `Page ${n}` })
      if (on) b.setAttribute('aria-current', 'page')
      b.addEventListener('click', () => go(n))
      return b
    }
    // page numbers: the first, the last, and two either side of this one
    const nums = []
    for (let n = 1; n <= count; n++) {
      if (n === 1 || n === count || Math.abs(n - p.page) <= 1 || (p.page <= 3 && n <= 4) || (p.page >= count - 2 && n >= count - 3)) nums.push(n)
      else if (nums[nums.length - 1] !== '…') nums.push('…')
    }
    const size = el('select', { className: 'io-select io-per', ariaLabel: 'How many to a page' }, PAGE_SIZES.map((n) => el('option', { value: n, textContent: `${n} a page`, selected: n === perPage })))
    size.addEventListener('change', () => { perPage = Number(size.value); try { localStorage.setItem('jb.admin.perPage', String(perPage)) } catch { /* only for this visit */ } Object.values(pages).forEach((x) => { x.page = 1 }); paint() })
    bar.replaceChildren(
      el('span', { className: 'io-page-count', textContent: `${from + 1}–${Math.min(from + perPage, items.length)} of ${items.length}` }),
      el('div', { className: 'io-page-nums' }, [btn('‹', p.page - 1, false, 'Previous page'), ...nums.map((n) => (n === '…' ? el('span', { className: 'io-page-gap', textContent: '…' }) : btn(String(n), n, n === p.page))), btn('›', p.page + 1, false, 'Next page')]),
      size,
    )
    return items.slice(from, from + perPage)
  }

  // ---------- the screen
  const list = el('div', { className: 'io-list' })
  const stats = el('div', { className: 'io-stats' })
  const chips = el('div', { className: 'io-chips', role: 'tablist', ariaLabel: 'Show' })
  const foot = el('div', { className: 'io-foot' })
  const search = el('input', { type: 'search', className: 'io-search', placeholder: 'Search name, email, piece, tracking…', ariaLabel: 'Search orders' })
  search.addEventListener('input', () => { state.q = search.value; paint() })
  const period = el('select', { className: 'io-select', ariaLabel: 'When' }, PERIODS.map(([v, t]) => el('option', { value: v, textContent: t })))
  period.addEventListener('change', () => { state.period = period.value; state.keep.clear(); paint() })
  const sort = el('select', { className: 'io-select', ariaLabel: 'Sort' }, SORTS.map(([v, t]) => el('option', { value: v, textContent: t })))
  sort.addEventListener('change', () => { state.sort = sort.value; paint() })
  const summary = el('div', { className: 'io-summary' })
  const download = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Download CSV', title: 'The orders showing now, as a spreadsheet' })
  download.addEventListener('click', () => csv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Date', 'Order', 'Kind', 'Name', 'Email', 'Phone', 'Items', 'Paid', 'Refunded', 'Currency', 'Status', 'Carrier', 'Tracking number', 'Address'],
    ...visible().map((o) => [new Date(o.created * 1000).toISOString().slice(0, 10), o.id, o.kind, o.name, o.email, o.phone, o.items.map((i) => (i.qty ? `${i.qty} x ${i.name}` : i.name)).join('; '), o.amount, o.refunded, o.currency, label(o)[1], CARRIERS[o.track.carrier] ? CARRIERS[o.track.carrier][0] : '', o.track.number, addressLines(o.address).join(', ')]),
  ]))
  const refresh = el('button', { type: 'button', className: 'ia-btn ghost io-refresh', textContent: 'Refresh' })
  refresh.addEventListener('click', () => load(true))
  const screen = el('main', { className: 'ia-orders is-orders' }, [
    el('div', { className: 'ia-home-inner' }, [
      el('div', { className: 'io-top' }, [
        el('div', {}, [
          el('div', { className: 'ia-kicker', textContent: 'Orders' }),
          el('h1', { textContent: 'Orders' }),
          el('p', { className: 'ia-lead', textContent: 'Everything paid by card (Stripe) or PayPal: prints from the Shop and support. Mark each order as you pack and post it; the buyer sees each step and the tracking number in their account.' }),
        ]),
        el('div', { className: 'io-actions' }, [download, refresh]),
      ]),
      sampleNote(),
      stats,
      el('div', { className: 'io-bar' }, [chips, el('div', { className: 'io-tools' }, [search, period, sort])]),
      summary,
      list,
      opager,
      foot,
    ]),
  ])

  const many = (n, word, plural) => `${n} ${n === 1 ? word : plural || `${word}s`}`
  const statCard = (n, t, d) => el('div', { className: 'io-stat' }, [el('strong', { textContent: n }), el('span', { textContent: t }), d ? el('small', { textContent: d }) : null])

  const paint = () => {
    const all = state.orders
    // the numbers along the top
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0)
    const thisMonth = all.filter((o) => o.created * 1000 >= month.getTime())
    const code = (all[0] && all[0].currency) || 'AUD'
    const takings = (list) => list.reduce((n, o) => n + o.amount - o.refunded, 0)
    stats.replaceChildren(
      statCard(String(all.filter((o) => inView(o, 'topost')).length), 'To post', 'paid, not yet shipped'),
      statCard(String(all.filter((o) => inView(o, 'shipped')).length), 'On the way'),
      statCard(money(takings(thisMonth.filter((o) => o.kind === 'shop')), code), 'Shop this month', many(thisMonth.filter((o) => o.kind === 'shop').length, 'order')),
      statCard(money(takings(thisMonth.filter((o) => o.kind === 'support')), code), 'Support this month', many(thisMonth.filter((o) => o.kind === 'support').length, 'supporter')),
    )
    chips.replaceChildren(...VIEWS.map(([v, t]) => {
      const b = el('button', { type: 'button', role: 'tab', className: `io-chip ${state.view === v ? 'on' : ''}`, ariaSelected: String(state.view === v) }, [t, el('small', { textContent: String(all.filter((o) => inView(o, v) && inPeriod(o)).length) })])
      b.addEventListener('click', () => { state.view = v; state.keep.clear(); paint() })
      return b
    }))
    badge()

    if (!state.loaded) { list.replaceChildren(state.problem ? problemBox() : el('div', { className: 'io-empty', textContent: 'Fetching the orders from Stripe…' })); foot.replaceChildren(); opager.replaceChildren(); return }
    if (!visible().length) opager.replaceChildren()
    const shown = visible()
    const filtered = state.view !== 'all' || state.period !== 'all' || state.q.trim()
    const clear = el('button', { type: 'button', className: 'io-link', textContent: 'Clear filters' })
    clear.addEventListener('click', () => { state.view = 'all'; state.period = 'all'; state.q = ''; search.value = ''; period.value = 'all'; state.keep.clear(); paint() })
    summary.replaceChildren(el('span', { textContent: `${shown.length === all.length ? 'All' : `${shown.length} of`} ${many(all.length, 'order')}${state.more ? ' loaded' : ''}` }), ...(filtered ? [clear] : []))
    download.disabled = !shown.length
    paintPeople()
    paintDiscounts()
    list.replaceChildren(...(shown.length ? paged('orders', shown, [state.view, state.period, state.q, state.sort].join('|'), opager, paint).map(row) : [el('div', { className: 'io-empty' }, [
      el('strong', { textContent: all.length ? 'Nothing here' : 'No orders yet' }),
      el('span', { textContent: all.length ? (state.view === 'topost' ? 'Every paid order has been posted.' : 'Try another filter, or clear the search.') : 'Orders show here as soon as someone pays.' }),
    ])]))
    const moreBtn = el('button', { type: 'button', className: 'ia-btn ghost', textContent: state.loading ? 'Loading…' : 'Load older orders' })
    moreBtn.addEventListener('click', () => load(false))
    foot.replaceChildren(...(state.problem ? [problemBox()] : []), ...(state.more ? [moreBtn] : []))
  }

  // an order saved a moment ago stays in sight until the filter changes, so it does not vanish mid-task
  const visible = () => {
    const shown = state.orders.filter((o) => (inView(o, state.view) || state.keep.has(o.id)) && inPeriod(o) && matches(o))
    const by = { new: (a, b) => b.created - a.created, old: (a, b) => a.created - b.created, high: (a, b) => b.amount - a.amount, low: (a, b) => a.amount - b.amount, name: (a, b) => (a.name || a.email || '~').localeCompare(b.name || b.email || '~') }
    return shown.sort(by[state.sort] || by.new)
  }
  // paid but not posted after a couple of days: worth a nudge
  const waiting = (o) => (inView(o, 'topost') ? Math.floor((Date.now() - o.created * 1000) / DAY) : 0)

  const problemBox = () => el('div', { className: `io-problem ${state.problem.setup ? 'is-setup' : ''}` }, [
    el('strong', { textContent: state.problem.setup ? 'Connect Stripe to see orders' : 'The orders could not be loaded' }),
    el('span', { textContent: state.problem.message }),
  ])

  const row = (o) => {
    const [kind, text] = label(o)
    const open = state.open.has(o.id)
    const first = o.items[0] ? o.items[0].name : o.kind === 'support' ? 'Support' : 'Payment'
    const what = o.items.length > 1 ? `${first} + ${o.items.length - 1} more` : first
    const head = el('button', { type: 'button', className: 'io-head', ariaExpanded: String(open) }, [
      el('span', { className: 'io-date', textContent: when(o.created) }),
      el('span', { className: 'io-who' }, [el('strong', { textContent: o.name || o.email || 'No name given' }), el('small', {}, [o.paidWith ? `${what} · ${o.paidWith}` : what, waiting(o) >= 2 ? el('span', { className: 'io-age', textContent: `waiting ${waiting(o)} days` }) : null])]),
      el('span', { className: 'io-amount', textContent: money(o.amount, o.currency) }),
      el('span', { className: `io-pill is-${kind}`, textContent: text }),
      svg('M6 9l6 6 6-6'),
    ])
    head.addEventListener('click', () => { if (open) state.open.delete(o.id); else state.open.add(o.id); paint() })
    const showing = state.pieces.has(o.id)
    const look = o.items.length ? iconBtn(PICTURE, showing ? 'Hide the pieces' : 'See the pieces bought', () => { if (showing) state.pieces.delete(o.id); else state.pieces.add(o.id); paint() }) : null
    if (look) { look.ariaExpanded = String(showing); if (showing) look.classList.add('on') }
    return el('article', { className: `io-order ${open ? 'is-open' : ''}` }, [el('div', { className: 'io-line' }, [head, rowTools(() => personModal(who(o)), () => deleteOrder(o), 'order', look)]), showing ? piecesPanel(o) : null, open ? body(o) : null])
  }

  /* What was bought, piece by piece: its picture, size, type, signed or not, how many, and a way
     into the piece itself. The details come from the site's content, matched by the line's name. */
  const chip = (k, v) => (v === '' || v == null ? null : el('span', { className: 'io-tag' }, [el('small', { textContent: k }), String(v)]))
  const piecesPanel = (o) => el('div', { className: 'io-pieces' }, o.items.map((i) => el('div', { className: 'io-piece' }, [
    i.src ? el('img', { src: i.src, alt: '', loading: 'lazy' }) : el('span', { className: 'io-piece-ph' }, [svg(PICTURE)]),
    el('div', { className: 'io-piece-info' }, [
      el('strong', { textContent: i.title || i.name }),
      el('div', { className: 'io-tags' }, [
        chip('Size', i.size || (i.slug ? 'Standard' : '')),
        chip('Type', i.type),
        chip('Signed', i.signed == null ? '' : i.signed ? 'Yes' : 'No'),
        chip('Qty', i.qty),
        chip('Universe', i.universe),
        chip('Category', i.category),
      ]),
      el('div', { className: 'io-piece-foot' }, [
        i.amount != null ? el('b', { textContent: money(i.amount, o.currency) }) : null,
        i.slug && !i.gone ? el('a', { className: 'io-link', href: `#/collections/work/entries/${i.slug}`, textContent: 'Open the piece' }) : el('span', { className: 'io-when', textContent: 'Taken off the site since' }),
      ]),
    ]),
  ])))

  const copyBtn = (text, what) => {
    const b = el('button', { type: 'button', className: 'io-link', textContent: `Copy ${what}` })
    b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); b.textContent = 'Copied' } catch { b.textContent = 'Could not copy' } setTimeout(() => { b.textContent = `Copy ${what}` }, 1600) })
    return b
  }

  const body = (o) => {
    const lines = addressLines(o.address)
    const left = el('div', { className: 'io-col' }, [
      el('h4', { textContent: o.kind === 'support' ? 'Support' : 'Ordered' }),
      el('ul', { className: 'io-items' }, o.items.map((i) => el('li', {}, [el('span', { textContent: i.qty ? `${i.qty} × ${i.name}` : i.name }), i.amount != null ? el('b', { textContent: money(i.amount, o.currency) }) : null]))),
      el('div', { className: 'io-total' }, [el('span', { textContent: 'Paid' }), el('b', { textContent: money(o.amount, o.currency) })]),
      o.paidWith ? el('div', { className: 'io-total is-method' }, [el('span', { textContent: 'Paid with' }), el('b', { textContent: o.paidWith })]) : null,
      o.discount > 0 ? el('div', { className: 'io-total is-discount' }, [el('span', { textContent: 'Discount code used' }), el('b', { textContent: `−${money(o.discount, o.currency)}` })]) : null,
      o.refunded > 0 ? el('div', { className: 'io-total is-refund' }, [el('span', { textContent: o.fullyRefunded ? 'Refunded in full' : 'Refunded' }), el('b', { textContent: `−${money(o.refunded, o.currency)}` })]) : null,
      el('p', { className: 'io-when', textContent: when(o.created, true) }),
      el('h4', { textContent: 'Buyer' }),
      el('p', { className: 'io-lines' }, [o.name || '—', o.email ? el('br') : null, o.email ? el('a', { href: `mailto:${o.email}`, textContent: o.email }) : null, o.phone ? el('br') : null, o.phone || null]),
      (() => { const n = state.orders.filter((x) => who(x) === who(o)).length; const b = el('button', { type: 'button', className: 'io-link', textContent: n > 1 ? `See all ${n} of their orders` : 'See them in Customers' }); b.addEventListener('click', () => showPerson(who(o))); b.style.marginTop = '8px'; return b })(),
      lines.length ? el('h4', { textContent: 'Post to' }) : null,
      lines.length ? el('p', { className: 'io-lines' }, lines.flatMap((l, i) => (i ? [el('br'), l] : [l]))) : null,
      lines.length ? copyBtn(lines.join('\n'), 'address') : null,
      el('div', { className: 'io-links' }, [
        o.receipt ? el('a', { className: 'io-link', href: o.receipt, target: '_blank', rel: 'noopener', textContent: 'Receipt' }) : null,
        o.stripe ? el('a', { className: 'io-link', href: o.stripe, target: '_blank', rel: 'noopener', textContent: o.provider === 'paypal' ? 'Open in PayPal' : 'Open in Stripe' }) : null,
      ]),
    ])
    return el('div', { className: 'io-body' }, [left, shippable(o) ? tracking(o) : el('div', { className: 'io-col io-quiet' }, [el('p', { textContent: o.kind === 'support' ? 'Support from a fan: nothing to post. A thank-you email goes a long way.' : o.fullyRefunded ? 'Refunded: nothing to post.' : 'Nothing to post for this one.' }), o.email ? el('a', { className: 'ia-btn ghost', href: `mailto:${o.email}?subject=${encodeURIComponent('Thank you!')}`, textContent: 'Email a thank-you' }) : null])])
  }

  const tracking = (o) => {
    const d = state.drafts[o.id] || (state.drafts[o.id] = { ...o.track })
    const field = (labelText, control) => el('label', { className: 'io-field' }, [el('span', { textContent: labelText }), control])
    const status = el('div', { className: 'io-steps', role: 'radiogroup', ariaLabel: 'Status' }, ['new', 'packed', 'shipped', 'delivered'].map((s) => {
      const b = el('button', { type: 'button', role: 'radio', ariaChecked: String(d.status === s), className: `io-step ${d.status === s ? 'on' : ''}`, textContent: STATUS[s] })
      // a new status is saved at once (with the carrier and number as they are), so the buyer sees it
      b.addEventListener('click', () => { if (state.saving[o.id] || (d.status === s && o.track.status === s)) return; d.status = s; saveTrack(o) })
      return b
    }))
    const carrier = el('select', { className: 'io-select' }, [el('option', { value: '', textContent: 'Choose…' }), ...Object.entries(CARRIERS).map(([v, [t]]) => el('option', { value: v, textContent: t, selected: d.carrier === v }))])
    carrier.addEventListener('change', () => { d.carrier = carrier.value; paint() })
    const number = el('input', { type: 'text', className: 'io-input', value: d.number, placeholder: 'For example 33ABC1234567', maxLength: 80 })
    number.addEventListener('input', () => { d.number = number.value })
    const note = el('textarea', { className: 'io-input', value: d.note, rows: 2, placeholder: 'Only you see this', maxLength: 400 })
    note.addEventListener('input', () => { d.note = note.value })
    const changed = ['status', 'carrier', 'number', 'note'].some((k) => (d[k] || '') !== (o.track[k] || ''))
    const save = el('button', { type: 'button', className: 'ia-btn', textContent: state.saving[o.id] ? 'Saving…' : 'Save', disabled: Boolean(state.saving[o.id]) })
    save.addEventListener('click', () => saveTrack(o))
    const url = trackUrl(o.track)
    const mail = o.email && o.track.number ? `mailto:${o.email}?subject=${encodeURIComponent('Your order is on its way')}&body=${encodeURIComponent(`Hi ${(o.name || '').split(' ')[0] || 'there'},\n\nYour order has been posted${CARRIERS[o.track.carrier] ? ` with ${CARRIERS[o.track.carrier][0]}` : ''}. The tracking number is ${o.track.number}.${url ? `\nTrack it here: ${url}` : ''}\n\nThank you for your support!`)}` : ''
    return el('div', { className: 'io-col io-track' }, [
      el('h4', { textContent: 'Posting' }),
      status,
      el('div', { className: 'io-pair' }, [field('Carrier', carrier), field('Tracking number', number)]),
      field('Note', note),
      el('div', { className: 'io-save' }, [
        save,
        state.saved[o.id] ? el('span', { className: `io-saved ${state.saved[o.id].ok ? '' : 'is-bad'}`, textContent: state.saved[o.id].text }) : changed ? el('span', { className: 'io-saved is-dim', textContent: 'Not saved yet' }) : null,
      ]),
      url || mail ? el('div', { className: 'io-links' }, [
        url ? el('a', { className: 'io-link', href: url, target: '_blank', rel: 'noopener', textContent: 'Track the parcel' }) : null,
        mail ? el('a', { className: 'io-link', href: mail, textContent: 'Email the tracking to the buyer' }) : null,
      ]) : null,
      o.track.at ? el('p', { className: 'io-when', textContent: `Last updated ${new Date(o.track.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` }) : null,
    ])
  }

  const saveTrack = async (o) => {
    const d = state.drafts[o.id]
    state.saving[o.id] = true; delete state.saved[o.id]; paint()
    try {
      const { ok, said } = await ask('/api/orders', { method: 'POST', body: JSON.stringify({ id: o.id, ...d }) })
      if (ok && said.track) { o.track = said.track; state.drafts[o.id] = { ...said.track }; state.saved[o.id] = { ok: true, text: inView(o, state.view) ? 'Saved' : `Saved. It is now under ${(VIEWS.find(([v]) => v !== 'all' && inView(o, v)) || ['all', 'All'])[1]}.` }; state.keep.add(o.id) }
      else state.saved[o.id] = { ok: false, text: said.message || 'Not saved. Try again.' }
    } catch { state.saved[o.id] = { ok: false, text: 'Could not reach the site. Try again.' } }
    state.saving[o.id] = false; paint()
    setTimeout(() => { if (state.saved[o.id] && state.saved[o.id].ok) { delete state.saved[o.id]; if (shown()) paint() } }, 2500)
  }

  // a newer load (say, after sample data is switched on) makes an older one's answer stale
  let loadGen = 0
  const load = async (fresh) => {
    if (state.loading && !fresh) return
    const gen = ++loadGen
    state.loading = true
    if (fresh) { state.problem = null; state.keep.clear(); refresh.textContent = 'Refreshing…'; crefresh.textContent = 'Refreshing…' }
    paint()
    try {
      const { ok, status, said } = await ask(`/api/orders${!fresh && state.next ? `?after=${encodeURIComponent(state.next)}` : ''}`)
      if (gen !== loadGen) return
      if (ok) {
        const got = Array.isArray(said.orders) ? said.orders : []
        state.orders = fresh ? got : [...state.orders, ...got.filter((o) => !state.orders.some((x) => x.id === o.id))]
        state.more = Boolean(said.more); state.next = said.next; state.loaded = true; state.problem = null
      } else {
        state.problem = { setup: Boolean(said.setup), message: said.message || (status === 404 ? 'The orders function is not on this copy of the site yet.' : 'Try Refresh in a moment.') }
      }
    } catch {
      state.problem = { message: 'Could not reach the site. Check the connection and press Refresh.' }
    }
    state.loading = false; refresh.textContent = 'Refresh'; crefresh.textContent = 'Refresh'
    paint()
  }

  // ---------- a spreadsheet of what is showing, saved by the browser (nothing is sent anywhere)
  const csv = (name, rows) => {
    const cell = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = el('a', { href: URL.createObjectURL(blob), download: name })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  // ---------- Customers: the orders gathered by buyer (by email, or by name when there is none)
  const who = (o) => String(o.email || o.name || o.id).trim().toLowerCase()
  /* Customer accounts (api/members.js): who has one, their member number, and the rewards gifted to
     them. Account holders who have not ordered yet are customers too. */
  const memb = { byEmail: new Map(), rewards: [], loaded: false, loading: false, problem: '' }
  const loadMembers = async () => {
    memb.loading = true
    try {
      const { ok, said } = await ask('/api/members')
      if (ok) { memb.byEmail = new Map((said.members || []).map((m) => [String(m.email).toLowerCase(), m])); memb.rewards = said.rewards || []; memb.problem = '' }
      else memb.problem = said.message || 'The accounts could not be loaded.'
    } catch { memb.problem = 'Could not reach the site.' }
    memb.loaded = true; memb.loading = false
  }
  const memberNo = (n) => (n ? `#${String(n).padStart(4, '0')}` : '')
  const everyone = () => {
    const map = new Map()
    for (const o of [...state.orders].sort((a, b) => b.created - a.created)) {
      const key = who(o)
      const p = map.get(key) || { key, name: '', email: '', phone: '', address: null, orders: [], spent: 0, given: 0, bought: 0, supported: 0, first: o.created, last: o.created, currency: o.currency }
      p.orders.push(o)
      p.name = p.name || o.name; p.email = p.email || o.email; p.phone = p.phone || o.phone; p.address = p.address || o.address
      if (o.kind === 'support') { p.supported += 1; p.given += o.amount - o.refunded } else { p.bought += 1; p.spent += o.amount - o.refunded }
      p.first = Math.min(p.first, o.created); p.last = Math.max(p.last, o.created)
      map.set(key, p)
    }
    for (const p of map.values()) p.member = p.email ? memb.byEmail.get(p.email.toLowerCase()) || null : null
    for (const [email, m] of memb.byEmail) {
      if (map.has(email) || [...map.values()].some((p) => p.member === m)) continue
      const at = Math.floor(new Date(m.createdAt).getTime() / 1000) || Math.floor(Date.now() / 1000)
      map.set(email, { key: email, name: m.name, email: m.email, phone: '', address: null, orders: [], spent: 0, given: 0, bought: 0, supported: 0, first: at, last: at, currency: 'AUD', member: m })
    }
    return [...map.values()]
  }
  const personIn = (p, view) => view === 'all'
    || (view === 'members' && Boolean(p.member))
    || (view === 'buyers' && p.bought > 0)
    || (view === 'repeat' && p.bought > 1)
    || (view === 'supporters' && p.supported > 0)
    || (view === 'waiting' && p.orders.some((o) => inView(o, 'topost')))
  const crowd = () => {
    const q = people.q.trim().toLowerCase()
    const by = { recent: (a, b) => b.last - a.last, spent: (a, b) => (b.spent + b.given) - (a.spent + a.given), orders: (a, b) => b.orders.length - a.orders.length, name: (a, b) => (a.name || a.email || '~').localeCompare(b.name || b.email || '~'), first: (a, b) => a.first - b.first }
    return everyone()
      .filter((p) => personIn(p, people.view) && (!q || [p.name, p.email, p.phone, ...addressLines(p.address), ...p.orders.flatMap((o) => o.items.map((i) => i.name))].join(' ').toLowerCase().includes(q)))
      .sort(by[people.sort] || by.recent)
  }
  const showPerson = (key) => {
    people.view = 'all'; people.q = ''; csearch.value = ''; people.open = new Set([key])
    location.hash = CROUTE
    paint()
    setTimeout(() => cscreen.querySelector('.io-order.is-open')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
  }
  const showOrder = (o) => {
    state.view = 'all'; state.period = 'all'; period.value = 'all'; state.q = o.email || o.name || ''; search.value = state.q; state.open.add(o.id)
    location.hash = ROUTE
    paint()
    setTimeout(() => screen.querySelector('.io-order.is-open')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
  }

  const clist = el('div', { className: 'io-list' })
  const cstats = el('div', { className: 'io-stats' })
  const cchips = el('div', { className: 'io-chips', role: 'tablist', ariaLabel: 'Show' })
  const csummary = el('div', { className: 'io-summary' })
  const csearch = el('input', { type: 'search', className: 'io-search', placeholder: 'Search name, email, town, piece…', ariaLabel: 'Search customers' })
  csearch.addEventListener('input', () => { people.q = csearch.value; paintPeople() })
  const csort = el('select', { className: 'io-select', ariaLabel: 'Sort' }, CSORTS.map(([v, t]) => el('option', { value: v, textContent: t })))
  csort.addEventListener('change', () => { people.sort = csort.value; paintPeople() })
  const crefresh = el('button', { type: 'button', className: 'ia-btn ghost io-refresh', textContent: 'Refresh' })
  crefresh.addEventListener('click', () => load(true))
  const cdownload = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Download CSV', title: 'The customers showing now, as a spreadsheet' })
  cdownload.addEventListener('click', () => csv(`customers-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Name', 'Email', 'Phone', 'Orders', 'Spent', 'Support given', 'Currency', 'First order', 'Last order', 'Address'],
    ...crowd().map((p) => [p.name, p.email, p.phone, p.bought, p.spent, p.given, p.currency, new Date(p.first * 1000).toISOString().slice(0, 10), new Date(p.last * 1000).toISOString().slice(0, 10), addressLines(p.address).join(', ')]),
  ]))
  const cscreen = el('main', { className: 'ia-orders is-customers' }, [
    el('div', { className: 'ia-home-inner' }, [
      el('div', { className: 'io-top' }, [
        el('div', {}, [
          el('div', { className: 'ia-kicker', textContent: 'Orders' }),
          el('h1', { textContent: 'Customers' }),
          el('p', { className: 'ia-lead', textContent: 'Everyone who has bought a print or given support, gathered from the orders. Open someone to see what they bought and get in touch.' }),
        ]),
        el('div', { className: 'io-actions' }, [cdownload, crefresh]),
      ]),
      sampleNote(),
      cstats,
      el('div', { className: 'io-bar' }, [cchips, el('div', { className: 'io-tools' }, [csearch, csort])]),
      csummary,
      clist,
      cpager,
    ]),
  ])

  const initials = (p) => (p.name || p.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  const paintPeople = () => {
    const all = everyone()
    const code = (state.orders[0] && state.orders[0].currency) || 'AUD'
    const buyers = all.filter((p) => p.bought > 0)
    const shopOrders = state.orders.filter((o) => o.kind === 'shop')
    cstats.replaceChildren(
      statCard(String(all.length), 'Customers', `${many(buyers.length, 'buyer')}, ${many(all.filter((p) => p.supported > 0).length, 'supporter')}`),
      statCard(String(all.filter((p) => p.bought > 1).length), 'Came back', 'bought more than once'),
      statCard(shopOrders.length ? money(Math.round(shopOrders.reduce((n, o) => n + o.amount, 0) / shopOrders.length), code) : '—', 'Average order'),
      statCard(buyers.length ? money(Math.max(...buyers.map((p) => p.spent)), code) : '—', 'Biggest spender', buyers.length ? [...buyers].sort((a, b) => b.spent - a.spent)[0].name || '' : ''),
    )
    cchips.replaceChildren(...CVIEWS.map(([v, t]) => {
      const b = el('button', { type: 'button', role: 'tab', className: `io-chip ${people.view === v ? 'on' : ''}`, ariaSelected: String(people.view === v) }, [t, el('small', { textContent: String(all.filter((p) => personIn(p, v)).length) })])
      b.addEventListener('click', () => { people.view = v; paintPeople() })
      return b
    }))
    if (!state.loaded) { clist.replaceChildren(state.problem ? problemBox() : el('div', { className: 'io-empty', textContent: 'Fetching the orders from Stripe…' })); csummary.replaceChildren(); return }
    const shown = crowd()
    const clear = el('button', { type: 'button', className: 'io-link', textContent: 'Clear filters' })
    clear.addEventListener('click', () => { people.view = 'all'; people.q = ''; csearch.value = ''; paintPeople() })
    csummary.replaceChildren(el('span', { textContent: `${shown.length === all.length ? 'All' : `${shown.length} of`} ${many(all.length, 'customer')}${state.more ? ' (from the orders loaded so far)' : ''}` }), ...(people.view !== 'all' || people.q.trim() ? [clear] : []))
    cdownload.disabled = !shown.length
    if (!shown.length) cpager.replaceChildren()
    clist.replaceChildren(...(shown.length ? paged('people', shown, [people.view, people.q, people.sort].join('|'), cpager, paintPeople).map(personRow) : [el('div', { className: 'io-empty' }, [
      el('strong', { textContent: all.length ? 'Nobody here' : 'No customers yet' }),
      el('span', { textContent: all.length ? 'Try another filter, or clear the search.' : 'Customers show here when they make an account or place their first order.' }),
    ])]))
  }

  const personRow = (p) => {
    const open = people.open.has(p.key)
    const tags = [p.member ? ['member', `Member ${memberNo(p.member.memberNo)}`] : null, p.bought > 1 ? ['repeat', 'Came back'] : null, p.supported ? ['support', 'Supporter'] : null, p.orders.some((o) => inView(o, 'topost')) ? ['new', 'Waiting'] : null].filter(Boolean)
    const head = el('button', { type: 'button', className: 'io-head io-person', ariaExpanded: String(open) }, [
      avatarOf(p),
      el('span', { className: 'io-who' }, [el('strong', { textContent: p.name || p.email || 'No name given' }), el('small', { textContent: [p.bought ? many(p.bought, 'order') : '', p.supported ? `supported ${p.supported === 1 ? 'once' : `${p.supported} times`}` : '', `last ${when(p.last)}`].filter(Boolean).join(' · ') })]),
      el('span', { className: 'io-amount', textContent: money(p.spent + p.given, p.currency) }),
      el('span', { className: 'io-tags' }, tags.map(([k, t]) => el('span', { className: `io-pill is-${k}`, textContent: t }))),
      svg('M6 9l6 6 6-6'),
    ])
    head.addEventListener('click', () => { if (open) people.open.delete(p.key); else people.open.add(p.key); paintPeople() })
    return el('article', { className: `io-order ${open ? 'is-open' : ''}` }, [el('div', { className: 'io-line' }, [head, rowTools(() => personModal(p.key), () => deletePerson(p), 'customer')]), open ? personBody(p) : null])
  }

  const personBody = (p) => {
    const lines = addressLines(p.address)
    const left = el('div', { className: 'io-col' }, [
      el('h4', { textContent: 'Contact' }),
      el('p', { className: 'io-lines' }, [p.name || '—', p.email ? el('br') : null, p.email ? el('a', { href: `mailto:${p.email}`, textContent: p.email }) : null, p.phone ? el('br') : null, p.phone || null]),
      el('div', { className: 'io-links' }, [p.email ? copyBtn(p.email, 'email') : null, p.email ? el('a', { className: 'io-link', href: `mailto:${p.email}`, textContent: 'Write to them' }) : null, p.email ? (() => { const b = el('button', { type: 'button', className: 'io-link', textContent: 'Give them a discount' }); b.addEventListener('click', () => discountFor([p.key])); return b })() : null]),
      lines.length ? el('h4', { textContent: 'Last posted to' }) : null,
      lines.length ? el('p', { className: 'io-lines' }, lines.flatMap((l, i) => (i ? [el('br'), l] : [l]))) : null,
      el('h4', { textContent: 'In short' }),
      el('ul', { className: 'io-items' }, [
        el('li', {}, [el('span', { textContent: 'Spent in the Shop' }), el('b', { textContent: money(p.spent, p.currency) })]),
        p.given ? el('li', {}, [el('span', { textContent: 'Support given' }), el('b', { textContent: money(p.given, p.currency) })]) : null,
        el('li', {}, [el('span', { textContent: p.orders.length ? 'First order' : 'Member since' }), el('b', { textContent: new Date(p.first * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) })]),
      ]),
    ])
    const right = el('div', { className: 'io-col' }, [
      el('h4', { textContent: `Their orders (${p.orders.length})` }),
      el('div', { className: 'io-mini' }, p.orders.map((o) => {
        const [kind, text] = label(o)
        const b = el('button', { type: 'button', className: 'io-mini-row', title: 'Open this order' }, [
          el('span', { className: 'io-date', textContent: when(o.created) }),
          el('span', { className: 'io-mini-what', textContent: o.items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(', ') || (o.kind === 'support' ? 'Support' : 'Payment') }),
          el('b', { textContent: money(o.amount, o.currency) }),
          el('span', { className: `io-pill is-${kind}`, textContent: text }),
        ])
        b.addEventListener('click', () => showOrder(o))
        return b
      })),
    ])
    return el('div', { className: 'io-body' }, [left, right])
  }

  // ---------- Discounts: a percentage off, for a while, for chosen customers or anyone with a code
  const disc = { list: [], loaded: false, loading: false, problem: null, view: 'active', q: '', sort: 'new', busy: false, result: null, note: null }
  const draft = { percent: 10, other: '', length: '30', date: '', mode: 'people', picked: new Set(), emails: '', code: '', uses: '1', usesTouched: false, label: '', find: '' }
  const now = () => Math.floor(Date.now() / 1000)
  const statusOf = (d) => (!d.active ? ['off', 'Switched off'] : d.until && d.until < now() ? ['ended', 'Ended'] : d.uses && d.used >= d.uses ? ['usedup', 'Used up'] : ['active', 'Active'])
  const dayText = (secs) => new Date(secs * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const endOf = () => {
    if (draft.length === 'none') return null
    if (draft.length === 'date') { if (!draft.date) return undefined; const d = new Date(`${draft.date}T23:59:00`); return Math.floor(d.getTime() / 1000) }
    return now() + Number(draft.length) * 86400
  }
  const typedEmails = () => [...new Set(draft.emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const chosen = () => {
    const byKey = new Map(everyone().map((p) => [p.key, p]))
    const list = [...draft.picked].map((k) => byKey.get(k)).filter((p) => p && p.email).map((p) => ({ email: p.email, name: p.name }))
    for (const e of typedEmails()) if (!list.some((p) => p.email.toLowerCase() === e)) list.push({ email: e, name: '' })
    return list
  }
  // send a personal code to its person by email, through the site (api/discounts.js), after asking
  const emailCode = (d) => sure({
    title: `Email ${d.code}?`,
    lines: [`To ${d.name ? `${d.name} (${d.email})` : d.email}: ${d.percent}% off${d.until ? `, until ${dayText(d.until)}` : ''}.`, 'They get an email in the site\'s style with the code, how to use it in their cart, and a link to the shop.'],
    ok: 'Send it',
    run: async () => {
      const { ok, said } = await ask('/api/discounts', { method: 'POST', body: JSON.stringify({ action: 'email', id: d.id }) })
      if (!ok) throw new Error(said.message || 'Not sent. Try again.')
      d.sent = said.discount && said.discount.sent
      const inList = disc.list.find((x) => x.id === d.id); if (inList) inList.sent = d.sent
      paintDiscounts()
    },
  })
  const emailBtn = (d) => {
    const b = el('button', { type: 'button', className: 'io-link', textContent: d.sent ? 'Email again' : 'Email it', title: d.sent ? `Emailed ${dayText(Math.floor(new Date(d.sent).getTime() / 1000))}` : 'Send it to them by email' })
    b.addEventListener('click', () => emailCode(d))
    return b
  }
  const discountFor = (keys) => {
    draft.mode = 'people'; draft.picked = new Set(keys); disc.result = null
    if (!draft.usesTouched) draft.uses = '1'
    location.hash = DROUTE
    paintDiscounts()
  }

  const dform = el('section', { className: 'io-panel' })
  const dresult = el('div')
  const dlist = el('div', { className: 'io-list' })
  const dchips = el('div', { className: 'io-chips', role: 'tablist', ariaLabel: 'Show' })
  const dsummary = el('div', { className: 'io-summary' })
  const dsearch = el('input', { type: 'search', className: 'io-search', placeholder: 'Search code, name, email…', ariaLabel: 'Search discounts' })
  dsearch.addEventListener('input', () => { disc.q = dsearch.value; paintDiscountList() })
  const dsort = el('select', { className: 'io-select', ariaLabel: 'Sort' }, DSORTS.map(([v, t]) => el('option', { value: v, textContent: t })))
  dsort.addEventListener('change', () => { disc.sort = dsort.value; paintDiscountList() })
  const drefresh = el('button', { type: 'button', className: 'ia-btn ghost io-refresh', textContent: 'Refresh' })
  drefresh.addEventListener('click', () => { loadDiscounts(); load(true) })
  const dscreen = el('main', { className: 'ia-orders is-discounts' }, [
    el('div', { className: 'ia-home-inner' }, [
      el('div', { className: 'io-top' }, [
        el('div', {}, [
          el('div', { className: 'ia-kicker', textContent: 'Orders' }),
          el('h1', { textContent: 'Discounts' }),
          el('p', { className: 'ia-lead', textContent: 'Make a discount code for chosen customers (each gets a code of their own) or for anyone you give the code to. Buyers type it in the discount box when they pay.' }),
        ]),
        el('div', { className: 'io-actions' }, [drefresh]),
      ]),
      sampleNote(),
      dform,
      dresult,
      el('h2', { className: 'io-h2', textContent: 'Your discount codes' }),
      el('div', { className: 'io-bar' }, [dchips, el('div', { className: 'io-tools' }, [dsearch, dsort])]),
      dsummary,
      dlist,
      dpager,
    ]),
  ])

  const step = (n, title, kids) => el('div', { className: 'io-step-row' }, [el('div', { className: 'io-step-n', textContent: String(n) }), el('div', { className: 'io-step-body' }, [el('h3', { textContent: title }), ...kids])])

  const paintDiscounts = () => {
    // 1. how much
    const pcts = el('div', { className: 'io-chips' }, [5, 10, 15, 20, 25, 30, 50].map((p) => {
      const b = el('button', { type: 'button', className: `io-chip ${!draft.other && draft.percent === p ? 'on' : ''}`, textContent: `${p}%` })
      b.addEventListener('click', () => { draft.percent = p; draft.other = ''; paintDiscounts() })
      return b
    }))
    const other = el('input', { type: 'number', className: 'io-input io-other', min: 1, max: 100, step: 0.5, value: draft.other, placeholder: 'Other %', ariaLabel: 'Another percentage' })
    other.addEventListener('input', () => { draft.other = other.value; draft.percent = Number(other.value) || 0; pcts.querySelectorAll('.io-chip').forEach((c) => c.classList.toggle('on', false)); sentence.replaceChildren(...sayIt()) })
    // 2. how long
    const length = el('select', { className: 'io-select' }, LENGTHS.map(([v, t]) => el('option', { value: v, textContent: t, selected: draft.length === v })))
    length.addEventListener('change', () => { draft.length = length.value; paintDiscounts() })
    const date = el('input', { type: 'date', className: 'io-input', value: draft.date, min: new Date(Date.now() + DAY).toISOString().slice(0, 10), ariaLabel: 'Last day' })
    date.addEventListener('input', () => { draft.date = date.value; sentence.replaceChildren(...sayIt()) })
    // 3. for whom
    const modes = el('div', { className: 'io-steps io-two', role: 'radiogroup', ariaLabel: 'For whom' }, [['people', 'Chosen customers'], ['anyone', 'Anyone with the code']].map(([v, t]) => {
      const b = el('button', { type: 'button', role: 'radio', ariaChecked: String(draft.mode === v), className: `io-step ${draft.mode === v ? 'on' : ''}`, textContent: t })
      b.addEventListener('click', () => { draft.mode = v; if (!draft.usesTouched) draft.uses = v === 'people' ? '1' : ''; paintDiscounts() })
      return b
    }))
    let whom
    if (draft.mode === 'people') {
      const all = everyone().filter((p) => p.email)
      const q = draft.find.trim().toLowerCase()
      const list = all.filter((p) => !q || [p.name, p.email].join(' ').toLowerCase().includes(q))
      const find = el('input', { type: 'search', className: 'io-search', value: draft.find, placeholder: 'Find a customer…', ariaLabel: 'Find a customer' })
      find.addEventListener('input', () => { draft.find = find.value; const at = find.selectionStart; paintDiscounts(); const again = dform.querySelector('.io-pick-find'); if (again) { again.focus(); again.setSelectionRange(at, at) } })
      find.classList.add('io-pick-find')
      const allBtn = el('button', { type: 'button', className: 'io-link', textContent: 'Choose all shown' })
      allBtn.addEventListener('click', () => { list.forEach((p) => draft.picked.add(p.key)); paintDiscounts() })
      const noneBtn = el('button', { type: 'button', className: 'io-link', textContent: 'Clear' })
      noneBtn.addEventListener('click', () => { draft.picked.clear(); paintDiscounts() })
      const box = el('div', { className: 'io-pick' }, list.length ? list.map((p) => {
        const input = el('input', { type: 'checkbox', checked: draft.picked.has(p.key) })
        input.addEventListener('change', () => { if (input.checked) draft.picked.add(p.key); else draft.picked.delete(p.key); paintDiscounts() })
        return el('label', { className: `io-pick-row ${draft.picked.has(p.key) ? 'on' : ''}` }, [input, el('span', { className: 'io-who' }, [el('strong', { textContent: p.name || p.email }), el('small', { textContent: [p.email, p.bought ? many(p.bought, 'order') : 'supporter', money(p.spent + p.given, p.currency)].join(' · ') })])])
      }) : [el('p', { className: 'io-pick-empty', textContent: state.loaded ? (all.length ? 'Nobody matches.' : 'No customers with an email yet. Type addresses below.') : 'Loading customers…' })])
      const emails = el('textarea', { className: 'io-input', rows: 2, value: draft.emails, placeholder: 'Or type email addresses, one per line' })
      emails.addEventListener('input', () => { draft.emails = emails.value; sentence.replaceChildren(...sayIt()); count.textContent = `${chosen().length} chosen` })
      const count = el('span', { className: 'io-chosen', textContent: `${chosen().length} chosen` })
      whom = [el('div', { className: 'io-pick-top' }, [find, count, allBtn, noneBtn]), box, emails]
    } else {
      const code = el('input', { type: 'text', className: 'io-input io-code', value: draft.code, placeholder: 'For example SPOOKY20', maxLength: 30, ariaLabel: 'The code' })
      code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); draft.code = code.value; sentence.replaceChildren(...sayIt()) })
      whom = [code, el('p', { className: 'io-hint', textContent: 'One code for everyone you share it with: letters, numbers and dashes. Handy for a season or a convention.' })]
    }
    // 4. how often, and the name buyers see
    const uses = el('select', { className: 'io-select' }, USES.map(([v, t]) => el('option', { value: v, textContent: t, selected: draft.uses === v })))
    uses.addEventListener('change', () => { draft.uses = uses.value; draft.usesTouched = true; sentence.replaceChildren(...sayIt()) })
    const labelBox = el('input', { type: 'text', className: 'io-input', value: draft.label, maxLength: 40, placeholder: `For example "Thank-you discount"` })
    labelBox.addEventListener('input', () => { draft.label = labelBox.value })
    const field = (t, control) => el('label', { className: 'io-field' }, [el('span', { textContent: t }), control])

    const sentence = el('p', { className: 'io-sentence' })
    const sayIt = () => {
      const end = endOf()
      const who = draft.mode === 'people' ? (chosen().length ? `for ${many(chosen().length, 'person', 'people')}, a code each` : 'for nobody yet') : `for anyone with ${draft.code || 'the code'}`
      const usesText = draft.uses ? `, ${draft.mode === 'people' ? 'each code ' : ''}used ${draft.uses === '1' ? 'once' : `up to ${draft.uses} times`}` : ''
      return [el('b', { textContent: `${draft.percent || '?'}% off` }), ` ${who}, ${end === null ? 'with no end date' : end === undefined ? 'until the date you pick' : `until ${dayText(end)}`}${usesText}.`]
    }
    sentence.replaceChildren(...sayIt())
    const create = el('button', { type: 'button', className: 'ia-btn io-go', textContent: disc.busy ? 'Making the codes…' : 'Create discount', disabled: disc.busy })
    create.addEventListener('click', makeDiscount)

    dform.replaceChildren(
      el('h2', { className: 'io-h2 io-panel-head', textContent: 'New discount' }),
      step(1, 'How much off', [el('div', { className: 'io-row' }, [pcts, other])]),
      step(2, 'How long it lasts', [el('div', { className: 'io-row' }, [length, draft.length === 'date' ? date : null])]),
      step(3, 'Who it is for', [modes, ...whom]),
      step(4, 'Details', [el('div', { className: 'io-pair' }, [field(draft.mode === 'people' ? 'Each code can be used' : 'The code can be used', uses), field('Name at checkout (optional)', labelBox)])]),
      el('div', { className: 'io-make' }, [sentence, create, disc.note ? el('span', { className: `io-saved ${disc.note.ok ? '' : 'is-bad'}`, textContent: disc.note.text }) : null]),
    )

    // what was just made: the codes, ready to copy or send
    dresult.replaceChildren(...(disc.result ? [el('section', { className: 'io-panel io-made' }, [
      el('h2', { className: 'io-h2 io-panel-head', textContent: `Made ${many(disc.result.length, 'code')}` }),
      el('p', { className: 'io-hint', textContent: 'Send each person their code: "Email it" sends it from the site, in its own design.' }),
      el('div', { className: 'io-mini' }, disc.result.map((d) => el('div', { className: 'io-made-row' }, [
        el('code', { textContent: d.code }),
        el('span', { className: 'io-mini-what', textContent: d.email ? (d.name ? `${d.name} · ${d.email}` : d.email) : 'Anyone with the code' }),
        copyBtn(d.code, 'code'),
        d.email ? emailBtn(d) : null,
      ]))),
      disc.result.length > 1 ? copyBtn(disc.result.map((d) => `${d.code}${d.email ? `  ${d.email}` : ''}`).join('\n'), 'all') : null,
    ])] : []))
    paintDiscountList()
  }

  const discIn = (d, view) => view === 'all' || statusOf(d)[0] === view
  const paintDiscountList = () => {
    const all = disc.list
    dchips.replaceChildren(...DVIEWS.map(([v, t]) => {
      const b = el('button', { type: 'button', role: 'tab', className: `io-chip ${disc.view === v ? 'on' : ''}`, ariaSelected: String(disc.view === v) }, [t, el('small', { textContent: String(all.filter((d) => discIn(d, v)).length) })])
      b.addEventListener('click', () => { disc.view = v; paintDiscountList() })
      return b
    }))
    if (!disc.loaded) { dlist.replaceChildren(disc.problem ? el('div', { className: `io-problem ${disc.problem.setup ? 'is-setup' : ''}` }, [el('strong', { textContent: disc.problem.setup ? 'Connect Stripe to make discounts' : 'The discounts could not be loaded' }), el('span', { textContent: disc.problem.message })]) : el('div', { className: 'io-empty', textContent: 'Fetching the discounts from Stripe…' })); dsummary.replaceChildren(); return }
    const q = disc.q.trim().toLowerCase()
    const by = { new: (a, b) => b.created - a.created, ending: (a, b) => (a.until || 9e12) - (b.until || 9e12), big: (a, b) => b.percent - a.percent, used: (a, b) => b.used - a.used }
    const shown = all.filter((d) => discIn(d, disc.view) && (!q || [d.code, d.name, d.email, d.label].join(' ').toLowerCase().includes(q))).sort(by[disc.sort] || by.new)
    dsummary.replaceChildren(el('span', { textContent: `${shown.length === all.length ? 'All' : `${shown.length} of`} ${many(all.length, 'code')}` }))
    if (!shown.length) dpager.replaceChildren()
    dlist.replaceChildren(...(shown.length ? paged('codes', shown, [disc.view, disc.q, disc.sort].join('|'), dpager, paintDiscountList).map(discRow) : [el('div', { className: 'io-empty' }, [el('strong', { textContent: all.length ? 'Nothing here' : 'No discount codes yet' }), el('span', { textContent: all.length ? 'Try another filter.' : 'Make the first one above.' })])]))
  }

  const discRow = (d) => {
    const [kind, text] = statusOf(d)
    const stop = el('button', { type: 'button', className: 'io-link is-danger', textContent: 'Switch off' })
    stop.addEventListener('click', () => sure({
      title: `Switch off ${d.code}?`,
      lines: ['It stops working at once and cannot be switched back on. It stays in this list, marked Switched off.'],
      ok: 'Switch off',
      run: async () => {
        const { ok, said } = await ask('/api/discounts', { method: 'POST', body: JSON.stringify({ action: 'stop', id: d.id }) })
        if (!ok || !said.discount) throw new Error(said.message || 'Stripe did not switch it off. Try again.')
        Object.assign(d, said.discount); paintDiscountList()
      },
    }))
    return el('article', { className: 'io-order io-disc' }, [
      el('div', { className: 'io-disc-row' }, [
        el('span', { className: 'io-pct', textContent: `${d.percent}%` }),
        el('span', { className: 'io-who' }, [el('code', { className: 'io-code-text', textContent: d.code }), el('small', { textContent: d.email ? (d.name ? `${d.name} · ${d.email}` : d.email) : 'Anyone with the code' })]),
        el('span', { className: 'io-disc-meta' }, [el('span', { textContent: d.until ? `${d.until < now() ? 'Ended' : 'Until'} ${dayText(d.until)}` : 'No end date' }), el('small', { textContent: `used ${d.used}${d.uses ? ` of ${d.uses}` : ' times'}${d.sent ? ` · emailed ${dayText(Math.floor(new Date(d.sent).getTime() / 1000))}` : ''}` })]),
        el('span', { className: `io-pill is-${kind === 'active' ? 'delivered' : kind === 'off' ? 'cancelled' : 'packed'}`, textContent: text }),
        el('span', { className: 'io-disc-actions' }, [copyBtn(d.code, 'code'), d.email && kind === 'active' ? emailBtn(d) : null, d.active ? stop : null]),
        rowTools(d.email ? () => personModal(d.email.toLowerCase(), d) : null, () => deleteCode(d), 'code'),
      ]),
    ])
  }

  const makeDiscount = async () => {
    const percent = Number(draft.percent)
    const until = endOf()
    const fail = (t) => { disc.note = { ok: false, text: t }; paintDiscounts() }
    if (!(percent > 0 && percent <= 100)) return fail('Choose how much off: between 1% and 100%.')
    if (until === undefined) return fail('Pick the last day the discount works.')
    const people = draft.mode === 'people' ? chosen() : []
    if (draft.mode === 'people' && !people.length) return fail('Choose at least one customer, or type an email address.')
    if (draft.mode === 'anyone' && draft.code.length < 3) return fail('Type the code: at least 3 letters or numbers.')
    disc.busy = true; disc.note = null; paintDiscounts()
    try {
      const { ok, said } = await ask('/api/discounts', { method: 'POST', body: JSON.stringify({ action: 'create', percent, until, uses: draft.uses, label: draft.label, ...(draft.mode === 'people' ? { people } : { code: draft.code }) }) })
      if (ok && Array.isArray(said.discounts)) {
        disc.result = said.discounts
        disc.list = [...said.discounts, ...disc.list]
        disc.note = said.failed && said.failed.length ? { ok: false, text: `No code could be made for ${said.failed.join(', ')}.` } : { ok: true, text: 'Done' }
        draft.picked.clear(); draft.emails = ''; draft.code = ''
      } else disc.note = { ok: false, text: said.message || 'Not made. Try again.' }
    } catch { disc.note = { ok: false, text: 'Could not reach the site. Try again.' } }
    disc.busy = false; paintDiscounts()
    if (disc.result) setTimeout(() => dresult.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
  }

  let discGen = 0
  const loadDiscounts = async () => {
    const gen = ++discGen
    disc.loading = true; disc.problem = null; drefresh.textContent = 'Refreshing…'; paintDiscountList()
    try {
      const { ok, said } = await ask('/api/discounts')
      if (gen !== discGen) return
      if (ok) { disc.list = Array.isArray(said.discounts) ? said.discounts : []; disc.loaded = true }
      else disc.problem = { setup: Boolean(said.setup), message: said.message || 'Try Refresh in a moment.' }
    } catch { disc.problem = { message: 'Could not reach the site. Check the connection and press Refresh.' } }
    disc.loading = false; drefresh.textContent = 'Refresh'; paintDiscountList()
  }

  // ---------- pop-ups: one at a time, over everything; Escape or a click outside closes them
  const modal = ({ title, content, actions = () => [], wide = false }) => {
    const back = el('div', { className: 'io-modal-back' })
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape') close() }
    const close = () => { back.remove(); removeEventListener('keydown', key, true); before?.focus?.() }
    const x = el('button', { type: 'button', className: 'io-icon io-modal-x', ariaLabel: 'Close' }, [svg(CROSS)])
    x.addEventListener('click', close)
    const foot = actions(close)
    const box = el('div', { className: `io-modal ${wide ? 'is-wide' : ''}`, role: 'dialog', ariaModal: 'true', ariaLabel: title }, [
      el('header', { className: 'io-modal-head' }, [el('h2', { textContent: title }), x]),
      el('div', { className: 'io-modal-body' }, content),
      foot.length ? el('footer', { className: 'io-modal-foot' }, foot) : null,
    ])
    back.addEventListener('mousedown', (e) => { if (e.target === back) close() })
    back.append(box)
    document.body.append(back)
    addEventListener('keydown', key, true)
    setTimeout(() => (box.querySelector('.io-modal-foot button:last-child') || x).focus(), 30)
    return close
  }
  // "are you sure?": the action runs inside the pop-up, which says so if it fails
  const sure = ({ title, lines, ok = 'Delete', run }) => {
    const said = el('p', { className: 'io-modal-error', hidden: true })
    modal({
      title,
      content: [...lines.map((l) => el('p', { textContent: l })), said],
      actions: (close) => {
        const no = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Cancel' })
        no.addEventListener('click', close)
        const yes = el('button', { type: 'button', className: 'ia-btn io-danger', textContent: ok })
        yes.addEventListener('click', async () => {
          yes.disabled = true; no.disabled = true; yes.textContent = 'Working…'; said.hidden = true
          try { await run(); close() } catch (e) { said.textContent = e.message; said.hidden = false; yes.disabled = false; no.disabled = false; yes.textContent = ok }
        })
        return [no, yes]
      },
    })
  }

  const iconBtn = (path, labelText, onClick, danger) => {
    const b = el('button', { type: 'button', className: `io-icon ${danger ? 'is-danger' : ''}`, ariaLabel: labelText, title: labelText }, [svg(path)])
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick() })
    return b
  }
  const rowTools = (info, remove, what, extra) => el('span', { className: 'io-row-tools' }, [
    extra || null,
    info ? iconBtn(CARD, 'Customer details', info) : el('span', { className: 'io-icon-gap' }),
    iconBtn(TRASH, `Delete this ${what}`, remove, true),
  ])

  // ---------- deleting. Stripe keeps every payment, so an order is marked and drops out of the
  // admin; a discount code is switched off and drops out. Nothing is refunded.
  const inChunks = (list, n = 100) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n))
  const dropOrders = async (orders) => {
    // a Stripe order goes by its payment; a PayPal one (kept in the database) by its own id
    const keys = orders.map((o) => o.pi || (o.provider === 'paypal' ? o.id : '')).filter(Boolean)
    const gone = new Set()
    for (const chunk of inChunks(keys)) {
      const { said } = await ask('/api/orders', { method: 'POST', body: JSON.stringify({ action: 'hide', pis: chunk.filter((k) => k.startsWith('pi_')), refs: chunk.filter((k) => k.startsWith('pp_')) }) })
      ;(said.hidden || []).forEach((p) => gone.add(p))
    }
    state.orders = state.orders.filter((o) => !gone.has(o.pi || o.id))
    if (gone.size < keys.length) throw new Error(`${keys.length - gone.size} could not be removed. Try again in a moment.`)
  }
  const dropCodes = async (codes) => {
    const gone = new Set()
    for (const chunk of inChunks(codes.map((d) => d.id))) {
      const { said } = await ask('/api/discounts', { method: 'POST', body: JSON.stringify({ action: 'delete', ids: chunk }) })
      ;(said.deleted || []).forEach((i) => gone.add(i))
    }
    disc.list = disc.list.filter((d) => !gone.has(d.id))
    if (disc.result) disc.result = disc.result.filter((d) => !gone.has(d.id))
    if (gone.size < codes.length) throw new Error(`${codes.length - gone.size} could not be deleted. Try again in a moment.`)
  }
  const after = () => { paint(); paintDiscounts() }
  const LEFT_IN_STRIPE = 'The payment record itself stays in your Stripe account (Stripe never deletes payments) and nothing is refunded.'
  const deleteOrder = (o) => sure({
    title: 'Delete this order?',
    lines: [`${o.name || o.email || 'No name'} · ${money(o.amount, o.currency)} · ${when(o.created)}`, `It is erased from the database: it leaves Orders, Customers and the buyer's account for good. ${LEFT_IN_STRIPE}`],
    run: async () => { await dropOrders([o]); after() },
  })
  const codesOf = (email) => (email ? disc.list.filter((d) => d.email && d.email.toLowerCase() === email.toLowerCase()) : [])
  const deletePerson = async (p) => {
    if (!disc.loaded && !disc.loading) await loadDiscounts()
    const codes = codesOf(p.email)
    sure({
      title: `Delete ${p.name || p.email || 'this customer'}?`,
      lines: [`Their ${many(p.orders.length, 'order')}${codes.length ? ` and ${many(codes.length, 'discount code')}` : ''} are erased from the database and leave the admin for good${codes.length ? '; the codes stop working' : ''}.`, LEFT_IN_STRIPE],
      run: async () => { await dropOrders(p.orders); if (codes.length) await dropCodes(codes); people.open.delete(p.key); after() },
    })
  }
  const deleteCode = (d) => sure({
    title: `Delete ${d.code}?`,
    lines: [`${d.percent}% off · ${d.email || 'anyone with the code'}`, 'It stops working at once and leaves this list for good.'],
    run: async () => { await dropCodes([d]); paintDiscounts() },
  })

  // test data: the samples, or payments and codes made with Stripe's test keys, cleared in one go.
  // Its button lives on Site → Show / hide, under the sample data switch.
  const clearTest = async () => {
    await checkSamples(true)
    if (!state.loaded) await load(true)
    if (!disc.loaded) await loadDiscounts()
    const orders = state.orders.filter((o) => o.test)
    const codes = disc.list.filter((d) => d.test)
    const buyers = new Set(orders.map(who)).size
    if (!orders.length && !codes.length) {
      modal({ title: 'No test data', content: [el('p', { textContent: state.problem || disc.problem ? 'The orders could not be read just now, so there is nothing to delete. Try again in a moment.' : 'There are no test orders, customers or discount codes to delete.' })], actions: (close) => { const b = el('button', { type: 'button', className: 'ia-btn', textContent: 'Close' }); b.addEventListener('click', close); return [b] } })
      return
    }
    sure({
      title: 'Delete all test data?',
      lines: [`${many(orders.length, 'test order')} (from ${many(buyers, 'test customer')}) and ${many(codes.length, 'test discount code')} leave the admin for good. Test codes stop working.`, sampleMode ? 'This is the sample data: it comes back when the page reloads, until it is switched off under Site → Show / hide → Admin.' : 'Only things made with Stripe test keys are touched. Real orders and codes stay as they are.'],
      ok: 'Delete test data',
      run: async () => { if (orders.length) await dropOrders(orders); if (codes.length) await dropCodes(codes); people.open.clear(); state.open.clear(); after() },
    })
  }

  // ---------- one customer, everything at once: contact, every address, what they bought, their codes
  /* A customer's picture as their account shows it (with its crop), or their initials. */
  const faceStyle = (face) => {
    const [x, y, z] = String(face || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n)))
    const fx = Number.isFinite(x) ? x : 50, fy = Number.isFinite(y) ? y : 22, zoom = Number.isFinite(z) && z >= 100 ? z : 100
    return `object-position:${fx}% ${fy}%;transform:scale(${zoom / 100});transform-origin:${fx}% ${fy}%`
  }
  const avatarOf = (p, size = '') => {
    const pic = p.member && p.member.picture
    return el('span', { className: `io-avatar ${size ? `is-${size}` : ''} ${pic ? 'has-pic' : ''}`, ariaHidden: 'true' }, [
      pic ? el('img', { src: pic.src, alt: '', loading: 'lazy', style: faceStyle(pic.face) }) : initials(p),
    ])
  }

  /* Rewards for one customer: what they have been gifted (each can be taken back), and one button
     to gift another, which opens a small picker. A gift counts as earned on their account. */
  const KIND = { picture: 'Picture', card: 'Card', discount: 'Discount' }
  const rewardThumb = (r) => {
    if (r.kind === 'picture' && r.picture) return el('span', { className: 'io-rthumb is-pic' }, [el('img', { src: r.picture, alt: '', loading: 'lazy', style: faceStyle(r.face) })])
    if (r.kind === 'card') return el('span', { className: `io-rthumb is-design is-${r.cardLook}`, style: r.cardArt ? `background-image:url("${r.cardArt}")` : '' })
    return el('span', { className: 'io-rthumb is-off', textContent: `${r.percent}%` })
  }
  const giftsFor = (p) => {
    const box = el('div', { className: 'io-gifts' })
    let picking = false, chosen = '', tell = true, busy = false, note = ''
    const send = async (action, r) => {
      const m = memb.byEmail.get(p.email.toLowerCase())
      busy = true; note = ''; draw()
      try {
        const { ok, said } = await ask('/api/members', { method: 'POST', body: JSON.stringify({ action, email: m.email, reward: r.id, tell }) })
        if (ok && said.member) {
          memb.byEmail.set(String(m.email).toLowerCase(), said.member); p.member = said.member
          note = action === 'gift' ? `${r.name} gifted${said.told ? ' · they have been emailed' : ''}` : `${r.name} taken back`
          picking = false; chosen = ''
        } else note = said.message || 'Not saved. Try again.'
      } catch { note = 'Could not reach the site. Try again.' }
      busy = false; draw()
    }
    const draw = () => {
      const m = p.email ? memb.byEmail.get(p.email.toLowerCase()) : null
      if (!memb.loaded) return box.replaceChildren(el('p', { className: 'io-dim-line', textContent: 'Fetching their account…' }))
      if (memb.problem) return box.replaceChildren(el('p', { className: 'io-dim-line', textContent: memb.problem }))
      if (!m) return box.replaceChildren(el('p', { className: 'io-dim-line', textContent: 'No account with this email yet, so nothing can be gifted.' }))
      const byId = new Map(memb.rewards.map((r) => [r.id, r]))
      const gifted = (m.gifts || []).map((id) => byId.get(id)).filter(Boolean)
      const open = memb.rewards.filter((r) => !(m.gifts || []).includes(r.id))
      // what they have: chips, each with a cross to take it back
      const chips = gifted.length
        ? el('div', { className: 'io-gift-chips' }, gifted.map((r) => {
          const x = el('button', { type: 'button', className: 'io-gift-x', ariaLabel: `Take back ${r.name}`, title: 'Take back', disabled: busy, textContent: '×' })
          x.addEventListener('click', () => send('ungift', r))
          return el('span', { className: 'io-gift-chip' }, [rewardThumb(r), el('span', { textContent: r.name }), x])
        }))
        : el('p', { className: 'io-dim-line', textContent: 'Nothing gifted yet.' })
      const add = el('button', { type: 'button', className: 'ia-btn ghost io-gift-add', disabled: busy || !open.length, textContent: open.length ? '+ Gift a reward' : 'Every reward gifted' })
      add.addEventListener('click', () => { picking = true; chosen = ''; note = ''; draw() })
      const kids = [chips]
      if (picking) {
        const tiles = el('div', { className: 'io-rpick', role: 'radiogroup', ariaLabel: 'Reward to gift' }, open.map((r) => {
          const t = el('button', { type: 'button', role: 'radio', ariaChecked: String(chosen === r.id), className: `io-rtile ${chosen === r.id ? 'on' : ''}` }, [rewardThumb(r), el('strong', { textContent: r.name }), el('small', { textContent: r.kind === 'discount' ? `${r.percent}% off` : KIND[r.kind] })])
          t.addEventListener('click', () => { chosen = r.id; draw() })
          return t
        }))
        const tellBox = el('input', { type: 'checkbox', checked: tell })
        tellBox.addEventListener('change', () => { tell = tellBox.checked })
        const cancel = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Cancel', disabled: busy })
        cancel.addEventListener('click', () => { picking = false; chosen = ''; draw() })
        const give = el('button', { type: 'button', className: 'ia-btn', disabled: busy || !chosen, textContent: busy ? 'Gifting…' : 'Gift it' })
        give.addEventListener('click', () => send('gift', byId.get(chosen)))
        kids.push(el('div', { className: 'io-gift-picker' }, [tiles, el('div', { className: 'io-gift-foot' }, [el('label', { className: 'io-gift-tell' }, [tellBox, el('span', { textContent: 'Email them about it' })]), el('span', { className: 'io-gift-grow' }), cancel, give])]))
      } else kids.push(add)
      if (note) kids.push(el('p', { className: 'io-gift-note', role: 'status', textContent: note }))
      box.replaceChildren(...kids)
    }
    draw()
    if (!memb.loaded && !memb.loading) loadMembers().then(draw)
    return box
  }
  const personModal = async (key, fromCode) => {
    if (!disc.loaded && !disc.loading) await loadDiscounts()
    if (!memb.loaded && !memb.loading) await loadMembers()
    const p = everyone().find((x) => x.key === key) || (fromCode ? { key, name: fromCode.name, email: fromCode.email, phone: '', orders: [], spent: 0, given: 0, bought: 0, supported: 0, currency: 'AUD' } : null)
    if (!p) return
    const addresses = [...new Map(p.orders.filter((o) => o.address).map((o) => { const lines = addressLines(o.address); return [lines.join('|'), lines] })).values()]
    const codes = codesOf(p.email)
    const block = (h, kids) => el('section', { className: 'io-mblock' }, [el('h4', { textContent: h }), ...kids])
    const text = [
      p.name, p.email, p.phone,
      ...addresses.map((a) => a.join(', ')),
      p.orders.length ? `Orders: ${p.orders.map((o) => `${when(o.created)} ${money(o.amount, o.currency)} (${label(o)[1]})`).join('; ')}` : '',
    ].filter(Boolean).join('\n')
    let closeIt = () => {}
    const orderRows = p.orders.map((o) => {
      const [kind, t] = label(o)
      const b = el('button', { type: 'button', className: 'io-mini-row', title: 'Open this order' }, [
        el('span', { className: 'io-date', textContent: when(o.created) }),
        el('span', { className: 'io-mini-what', textContent: o.items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(', ') || 'Payment' }),
        el('b', { textContent: money(o.amount, o.currency) }),
        el('span', { className: `io-pill is-${kind}`, textContent: t }),
      ])
      b.addEventListener('click', () => { closeIt(); showOrder(o) })
      return b
    })
    closeIt = modal({
      title: 'Customer',
      wide: true,
      content: [
        el('header', { className: 'io-profile' }, [
          avatarOf(p, 'lg'),
          el('div', { className: 'io-profile-who' }, [
            el('strong', { textContent: p.name || p.email || 'No name given' }),
            p.email ? el('span', { textContent: p.email }) : null,
            el('span', { className: 'io-profile-tags' }, [
              p.member ? el('span', { className: 'io-pill is-member', textContent: `Member ${memberNo(p.member.memberNo)}` }) : el('span', { className: 'io-pill', textContent: 'No account' }),
              p.member ? el('span', { className: `io-pill ${p.member.verified ? 'is-delivered' : ''}`, textContent: p.member.verified ? 'Email confirmed' : 'Email not confirmed' }) : null,
            ]),
          ]),
        ]),
        block('Rewards gifted', [giftsFor(p)]),
        el('div', { className: 'io-mgrid' }, [
          block('Contact', [el('p', { className: 'io-lines' }, [p.name || '—', p.email ? el('br') : null, p.email ? el('a', { href: `mailto:${p.email}`, textContent: p.email }) : null, p.phone ? el('br') : null, p.phone || null])]),
          block(addresses.length > 1 ? `Addresses (${addresses.length})` : 'Address', addresses.length ? addresses.map((a) => el('div', { className: 'io-maddress' }, [el('p', { className: 'io-lines' }, a.flatMap((l, i) => (i ? [el('br'), l] : [l]))), copyBtn(a.join('\n'), 'address')])) : [el('p', { className: 'io-lines io-dim', textContent: 'No postal address (support, or nothing posted yet).' })]),
          block('In short', [el('ul', { className: 'io-items' }, [
            el('li', {}, [el('span', { textContent: 'Orders' }), el('b', { textContent: String(p.bought) })]),
            el('li', {}, [el('span', { textContent: 'Spent in the Shop' }), el('b', { textContent: money(p.spent, p.currency) })]),
            p.given ? el('li', {}, [el('span', { textContent: 'Support given' }), el('b', { textContent: money(p.given, p.currency) })]) : null,
            p.orders.length ? el('li', {}, [el('span', { textContent: 'Customer since' }), el('b', { textContent: dayText(p.first) })]) : null,
            p.orders.length ? el('li', {}, [el('span', { textContent: 'Last order' }), el('b', { textContent: dayText(p.last) })]) : null,
          ])]),
          block('Discount codes', codes.length ? codes.map((d) => el('p', { className: 'io-lines' }, [el('code', { className: 'io-code-text', textContent: d.code }), ` · ${d.percent}% · ${statusOf(d)[1]}`])) : [el('p', { className: 'io-lines io-dim', textContent: disc.loaded ? 'None' : 'Could not load the codes just now.' })]),
        ]),
        p.orders.length ? block(`Their orders (${p.orders.length})`, [el('div', { className: 'io-mini' }, orderRows)]) : null,
      ].filter(Boolean),
      actions: (close) => {
        const copyAll = copyBtn(text, 'all details')
        copyAll.className = 'ia-btn ghost'
        const write = p.email ? el('a', { className: 'ia-btn ghost', href: `mailto:${p.email}`, textContent: 'Write to them' }) : null
        const done = el('button', { type: 'button', className: 'ia-btn', textContent: 'Close' })
        done.addEventListener('click', close)
        return [copyAll, write, done].filter(Boolean)
      },
    })
  }

  const testBox = el('div', { className: 'io-testbox' }, [
    el('div', {}, [el('strong', { textContent: 'Test data' }), el('span', { textContent: 'Deletes every test order, test customer and test discount code from Orders, Customers and Discounts: the sample data, and anything paid with Stripe test keys. Real orders and codes are never touched. You are asked first.' })]),
    (() => {
      const b = el('button', { type: 'button', className: 'ia-btn ghost io-clear', textContent: 'Delete test data' })
      b.addEventListener('click', async () => { b.disabled = true; b.textContent = 'Checking…'; try { await clearTest() } finally { b.disabled = false; b.textContent = 'Delete test data' } })
      return b
    })(),
  ])
  // the form is drawn by the admin itself: the box goes in under the switch whenever the form is showing
  setInterval(() => {
    if (!location.hash.startsWith('#/collections/site/entries/visibility')) return
    const field = document.querySelector('label[for^="samples-field"]')?.closest('[class*="ControlContainer"]')
    if (field && field.nextElementSibling !== testBox) field.after(testBox)
  }, 400)

  // ---------- its place in the navigation, with the number still to post
  const count = el('span', { className: 'io-count', hidden: true })
  const link = el('a', { href: ROUTE, className: 'io-nav' }, [svg(BOX), el('span', { textContent: 'Orders' }), count])
  const clink = el('a', { href: CROUTE, className: 'io-nav' }, [svg(PEOPLE), el('span', { textContent: 'Customers' })])
  const dlink = el('a', { href: DROUTE, className: 'io-nav' }, [svg(TAG), el('span', { textContent: 'Discounts' })])
  const badge = () => {
    const n = state.orders.filter((o) => inView(o, 'topost')).length
    count.hidden = !n; count.textContent = n > 99 ? '99+' : String(n)
  }
  const shown = () => location.hash === ROUTE || location.hash === CROUTE || location.hash === DROUTE
  const sync = () => {
    const at = location.hash === ROUTE ? 'orders' : location.hash === CROUTE ? 'customers' : location.hash === DROUTE ? 'discounts' : ''
    if (at) document.documentElement.dataset.iaOrders = at
    else delete document.documentElement.dataset.iaOrders
    link.classList.toggle('on', at === 'orders')
    clink.classList.toggle('on', at === 'customers')
    dlink.classList.toggle('on', at === 'discounts')
    if (at) {
      document.querySelectorAll('.ia-side nav a.on').forEach((a) => a !== link && a !== clink && a !== dlink && a.classList.remove('on'))
      checkSamples().then(() => {
        if (!state.loaded && !state.loading) load(true)
        if (at === 'discounts' && !disc.loaded && !disc.loading) loadDiscounts()
        if (at === 'customers' && !memb.loaded && !memb.loading) loadMembers().then(() => { if (location.hash === CROUTE) paintPeople() })
      })
      ;(at === 'orders' ? screen : at === 'customers' ? cscreen : dscreen).scrollTop = 0
    }
  }
  addEventListener('hashchange', sync)

  // the left navigation is built once the admin has read its settings; wait for it
  const place = setInterval(() => {
    const scroll = document.querySelector('.ia-side .ia-scroll')
    if (!scroll) return
    clearInterval(place)
    const ours = [el('div', { className: 'ia-label', textContent: 'Orders' }), el('nav', { ariaLabel: 'Orders and customers' }, [link, clink, dlink])]
    const shopNav = scroll.querySelector('nav[data-group="shop"]')
    if (shopNav) shopNav.after(...ours)
    else scroll.append(el('div', { className: 'io-divider', role: 'separator' }), ...ours)
    document.body.append(screen, cscreen, dscreen)
    // the Overview: the same two, as tiles at the end
    const overview = document.querySelector('.ia-home-inner')
    if (overview) {
      const tile = (icon, title, text, href, action) => el('div', { className: 'ia-tile' }, [el('div', { className: 'ia-tile-icon' }, [svg(icon)]), el('h3', { textContent: title }), el('p', { textContent: text }), el('div', { className: 'ia-tile-actions' }, [el('a', { className: 'ia-btn', href, textContent: action })])])
      const groupsShown = overview.querySelectorAll(':scope > .ia-group')
      const section = (el('section', { className: 'ia-group' }, [
        el('h2', { textContent: 'Orders, customers and discounts' }),
        el('p', { textContent: 'What has been bought through the Shop, who bought it, the posting of each order, and discount codes.' }),
        el('div', { className: 'ia-tiles' }, [
          tile(BOX, 'Orders', 'Every payment, newest first. Mark orders packed and shipped, add tracking, download a spreadsheet.', ROUTE, 'Open orders'),
          tile(PEOPLE, 'Customers', 'Everyone who has bought or given support: how often, how much, and their orders.', CROUTE, 'Open customers'),
          tile(TAG, 'Discounts', 'Make a discount code: a percentage off, for chosen customers or anyone with the code, for as long as you like.', DROUTE, 'Open discounts'),
        ]),
      ]))
      if (groupsShown[0]) groupsShown[0].after(section)
      else overview.append(section)
    }
    sync()
    // once logged in, a quiet first look so the number beside Orders is right from the start
    const ready = setInterval(() => {
      if (!document.querySelector('[class*="AppHeader"], [class*="ToolbarContainer"]')) return
      clearInterval(ready)
      checkSamples(true).then(() => { if (!state.loaded && !state.loading) load(true) })
    }, 500)
  }, 200)
  setTimeout(() => clearInterval(place), 30000)
})()
