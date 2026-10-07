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
  const CVIEWS = [['all', 'Everyone'], ['buyers', 'Buyers'], ['repeat', 'Bought more than once'], ['supporters', 'Supporters'], ['waiting', 'Waiting for a parcel']]
  const CSORTS = [['recent', 'Most recent'], ['spent', 'Spent the most'], ['orders', 'Most orders'], ['name', 'Name A–Z'], ['first', 'Customer the longest']]
  const DAY = 864e5
  const TAG = 'M3 12V4h8l10 10-8 8z M7.500 8.500h.01'
  const DVIEWS = [['active', 'Active'], ['usedup', 'Used up'], ['ended', 'Ended'], ['off', 'Switched off'], ['all', 'All']]
  const DSORTS = [['new', 'Newest first'], ['ending', 'Ending soonest'], ['big', 'Biggest discount'], ['used', 'Most used']]
  const LENGTHS = [['7', '1 week'], ['14', '2 weeks'], ['30', '1 month'], ['90', '3 months'], ['180', '6 months'], ['date', 'Until a date…'], ['none', 'No end date']]
  const USES = [['1', 'Once'], ['3', '3 times'], ['10', '10 times'], ['', 'No limit']]

  const people = { q: '', view: 'all', sort: 'recent', open: new Set() }
  const state = { orders: [], more: false, next: null, loaded: false, loading: false, problem: null, view: 'topost', q: '', period: 'all', sort: 'new', open: new Set(), keep: new Set(), drafts: {}, saving: {}, saved: {} }

  const pass = () => { try { return JSON.parse(localStorage.getItem('decap-cms-user') || '{}').token || '' } catch { return '' } }
  const ask = async (url, init = {}) => {
    const answer = await fetch(url, { ...init, headers: { Authorization: `Bearer ${pass()}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
    const said = await answer.json().catch(() => ({}))
    return { ok: answer.ok, status: answer.status, said }
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

  // ---------- the screen
  const list = el('div', { className: 'io-list' })
  const stats = el('div', { className: 'io-stats' })
  const chips = el('div', { className: 'io-chips', role: 'tablist', ariaLabel: 'Show' })
  const foot = el('div', { className: 'io-foot' })
  const testNote = el('span', { className: 'io-test', textContent: 'Test mode', hidden: true })
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
          el('div', { className: 'ia-kicker' }, ['Orders ', testNote]),
          el('h1', { textContent: 'Orders' }),
          el('p', { className: 'ia-lead', textContent: 'Everything paid through Stripe: prints from the Shop and support. Mark each order as you pack and post it; the tracking number goes with it.' }),
        ]),
        el('div', { className: 'io-actions' }, [download, refresh]),
      ]),
      stats,
      el('div', { className: 'io-bar' }, [chips, el('div', { className: 'io-tools' }, [search, period, sort])]),
      summary,
      list,
      foot,
    ]),
  ])

  const many = (n, word, plural) => `${n} ${n === 1 ? word : plural || `${word}s`}`
  const statCard = (n, t, d) => el('div', { className: 'io-stat' }, [el('strong', { textContent: n }), el('span', { textContent: t }), d ? el('small', { textContent: d }) : null])

  const paint = () => {
    const all = state.orders
    testNote.hidden = !all.some((o) => o.test)
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

    if (!state.loaded) { list.replaceChildren(state.problem ? problemBox() : el('div', { className: 'io-empty', textContent: 'Fetching the orders from Stripe…' })); foot.replaceChildren(); return }
    const shown = visible()
    const filtered = state.view !== 'all' || state.period !== 'all' || state.q.trim()
    const clear = el('button', { type: 'button', className: 'io-link', textContent: 'Clear filters' })
    clear.addEventListener('click', () => { state.view = 'all'; state.period = 'all'; state.q = ''; search.value = ''; period.value = 'all'; state.keep.clear(); paint() })
    summary.replaceChildren(el('span', { textContent: `${shown.length === all.length ? 'All' : `${shown.length} of`} ${many(all.length, 'order')}${state.more ? ' loaded' : ''}` }), ...(filtered ? [clear] : []))
    download.disabled = !shown.length
    paintPeople()
    paintDiscounts()
    list.replaceChildren(...(shown.length ? shown.map(row) : [el('div', { className: 'io-empty' }, [
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
      el('span', { className: 'io-who' }, [el('strong', { textContent: o.name || o.email || 'No name given' }), el('small', {}, [what, waiting(o) >= 2 ? el('span', { className: 'io-age', textContent: `waiting ${waiting(o)} days` }) : null])]),
      el('span', { className: 'io-amount', textContent: money(o.amount, o.currency) }),
      el('span', { className: `io-pill is-${kind}`, textContent: text }),
      svg('M6 9l6 6 6-6'),
    ])
    head.addEventListener('click', () => { if (open) state.open.delete(o.id); else state.open.add(o.id); paint() })
    return el('article', { className: `io-order ${open ? 'is-open' : ''}` }, [head, open ? body(o) : null])
  }

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
        o.stripe ? el('a', { className: 'io-link', href: o.stripe, target: '_blank', rel: 'noopener', textContent: 'Open in Stripe' }) : null,
      ]),
    ])
    return el('div', { className: 'io-body' }, [left, shippable(o) ? tracking(o) : el('div', { className: 'io-col io-quiet' }, [el('p', { textContent: o.kind === 'support' ? 'Support from a fan: nothing to post. A thank-you email goes a long way.' : o.fullyRefunded ? 'Refunded: nothing to post.' : 'Nothing to post for this one.' }), o.email ? el('a', { className: 'ia-btn ghost', href: `mailto:${o.email}?subject=${encodeURIComponent('Thank you!')}`, textContent: 'Email a thank-you' }) : null])])
  }

  const tracking = (o) => {
    const d = state.drafts[o.id] || (state.drafts[o.id] = { ...o.track })
    const field = (labelText, control) => el('label', { className: 'io-field' }, [el('span', { textContent: labelText }), control])
    const status = el('div', { className: 'io-steps', role: 'radiogroup', ariaLabel: 'Status' }, ['new', 'packed', 'shipped', 'delivered'].map((s) => {
      const b = el('button', { type: 'button', role: 'radio', ariaChecked: String(d.status === s), className: `io-step ${d.status === s ? 'on' : ''}`, textContent: STATUS[s] })
      b.addEventListener('click', () => { d.status = s; paint() })
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

  const load = async (fresh) => {
    if (state.loading) return
    state.loading = true
    if (fresh) { state.problem = null; state.keep.clear(); refresh.textContent = 'Refreshing…'; crefresh.textContent = 'Refreshing…' }
    paint()
    try {
      const { ok, status, said } = await ask(`/api/orders${!fresh && state.next ? `?after=${encodeURIComponent(state.next)}` : ''}`)
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
    return [...map.values()]
  }
  const personIn = (p, view) => view === 'all'
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
      cstats,
      el('div', { className: 'io-bar' }, [cchips, el('div', { className: 'io-tools' }, [csearch, csort])]),
      csummary,
      clist,
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
    clist.replaceChildren(...(shown.length ? shown.map(personRow) : [el('div', { className: 'io-empty' }, [
      el('strong', { textContent: all.length ? 'Nobody here' : 'No customers yet' }),
      el('span', { textContent: all.length ? 'Try another filter, or clear the search.' : 'Customers show here after their first order.' }),
    ])]))
  }

  const personRow = (p) => {
    const open = people.open.has(p.key)
    const tags = [p.bought > 1 ? ['repeat', 'Came back'] : null, p.supported ? ['support', 'Supporter'] : null, p.orders.some((o) => inView(o, 'topost')) ? ['new', 'Waiting'] : null].filter(Boolean)
    const head = el('button', { type: 'button', className: 'io-head io-person', ariaExpanded: String(open) }, [
      el('span', { className: 'io-avatar', textContent: initials(p), ariaHidden: 'true' }),
      el('span', { className: 'io-who' }, [el('strong', { textContent: p.name || p.email || 'No name given' }), el('small', { textContent: [p.bought ? many(p.bought, 'order') : '', p.supported ? `supported ${p.supported === 1 ? 'once' : `${p.supported} times`}` : '', `last ${when(p.last)}`].filter(Boolean).join(' · ') })]),
      el('span', { className: 'io-amount', textContent: money(p.spent + p.given, p.currency) }),
      el('span', { className: 'io-tags' }, tags.map(([k, t]) => el('span', { className: `io-pill is-${k}`, textContent: t }))),
      svg('M6 9l6 6 6-6'),
    ])
    head.addEventListener('click', () => { if (open) people.open.delete(p.key); else people.open.add(p.key); paintPeople() })
    return el('article', { className: `io-order ${open ? 'is-open' : ''}` }, [head, open ? personBody(p) : null])
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
        el('li', {}, [el('span', { textContent: 'First order' }), el('b', { textContent: new Date(p.first * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) })]),
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
  const mailFor = (d) => {
    const first = (d.name || '').split(' ')[0] || 'there'
    const end = d.until ? ` It works until ${dayText(d.until)}.` : ''
    return `mailto:${d.email}?subject=${encodeURIComponent(`${d.percent}% off at JBeatsArt`)}&body=${encodeURIComponent(`Hi ${first},\n\nHere is ${d.percent}% off anything in the shop: ${d.code}\nType it in the discount code box when you pay.${end}\n\n${location.origin}/shop\n\nThank you for the support!`)}`
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
      dform,
      dresult,
      el('h2', { className: 'io-h2', textContent: 'Your discount codes' }),
      el('div', { className: 'io-bar' }, [dchips, el('div', { className: 'io-tools' }, [dsearch, dsort])]),
      dsummary,
      dlist,
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
      el('p', { className: 'io-hint', textContent: 'Send each person their code. The email button writes the message for you in your own email app.' }),
      el('div', { className: 'io-mini' }, disc.result.map((d) => el('div', { className: 'io-made-row' }, [
        el('code', { textContent: d.code }),
        el('span', { className: 'io-mini-what', textContent: d.email ? (d.name ? `${d.name} · ${d.email}` : d.email) : 'Anyone with the code' }),
        copyBtn(d.code, 'code'),
        d.email ? el('a', { className: 'io-link', href: mailFor(d), textContent: 'Email it' }) : null,
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
    dlist.replaceChildren(...(shown.length ? shown.map(discRow) : [el('div', { className: 'io-empty' }, [el('strong', { textContent: all.length ? 'Nothing here' : 'No discount codes yet' }), el('span', { textContent: all.length ? 'Try another filter.' : 'Make the first one above.' })])]))
  }

  const discRow = (d) => {
    const [kind, text] = statusOf(d)
    const stop = el('button', { type: 'button', className: 'io-link is-danger', textContent: 'Switch off' })
    stop.addEventListener('click', async () => {
      if (!confirm(`Switch off ${d.code}? It stops working at once and cannot be switched back on.`)) return
      stop.textContent = 'Switching off…'
      const { ok, said } = await ask('/api/discounts', { method: 'POST', body: JSON.stringify({ action: 'stop', id: d.id }) })
      if (ok && said.discount) Object.assign(d, said.discount)
      paintDiscountList()
    })
    return el('article', { className: 'io-order io-disc' }, [
      el('div', { className: 'io-disc-row' }, [
        el('span', { className: 'io-pct', textContent: `${d.percent}%` }),
        el('span', { className: 'io-who' }, [el('code', { className: 'io-code-text', textContent: d.code }), el('small', { textContent: d.email ? (d.name ? `${d.name} · ${d.email}` : d.email) : 'Anyone with the code' })]),
        el('span', { className: 'io-disc-meta' }, [el('span', { textContent: d.until ? `${d.until < now() ? 'Ended' : 'Until'} ${dayText(d.until)}` : 'No end date' }), el('small', { textContent: `used ${d.used}${d.uses ? ` of ${d.uses}` : ' times'}` })]),
        el('span', { className: `io-pill is-${kind === 'active' ? 'delivered' : kind === 'off' ? 'cancelled' : 'packed'}`, textContent: text }),
        el('span', { className: 'io-disc-actions' }, [copyBtn(d.code, 'code'), d.email && kind === 'active' ? el('a', { className: 'io-link', href: mailFor(d), textContent: 'Email it' }) : null, d.active ? stop : null]),
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

  const loadDiscounts = async () => {
    if (disc.loading) return
    disc.loading = true; disc.problem = null; drefresh.textContent = 'Refreshing…'; paintDiscountList()
    try {
      const { ok, said } = await ask('/api/discounts')
      if (ok) { disc.list = Array.isArray(said.discounts) ? said.discounts : []; disc.loaded = true }
      else disc.problem = { setup: Boolean(said.setup), message: said.message || 'Try Refresh in a moment.' }
    } catch { disc.problem = { message: 'Could not reach the site. Check the connection and press Refresh.' } }
    disc.loading = false; drefresh.textContent = 'Refresh'; paintDiscountList()
  }

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
      if (!state.loaded && !state.loading) load(true)
      if (at === 'discounts' && !disc.loaded && !disc.loading) loadDiscounts()
      ;(at === 'orders' ? screen : at === 'customers' ? cscreen : dscreen).scrollTop = 0
    }
  }
  addEventListener('hashchange', sync)

  // the left navigation is built once the admin has read its settings; wait for it
  const place = setInterval(() => {
    const scroll = document.querySelector('.ia-side .ia-scroll')
    if (!scroll) return
    clearInterval(place)
    scroll.append(el('div', { className: 'io-divider', role: 'separator' }), el('div', { className: 'ia-label', textContent: 'Orders' }), el('nav', { ariaLabel: 'Orders and customers' }, [link, clink, dlink]))
    document.body.append(screen, cscreen, dscreen)
    // the Overview: the same two, as tiles at the end
    const overview = document.querySelector('.ia-home-inner')
    if (overview) {
      const tile = (icon, title, text, href, action) => el('div', { className: 'ia-tile' }, [el('div', { className: 'ia-tile-icon' }, [svg(icon)]), el('h3', { textContent: title }), el('p', { textContent: text }), el('div', { className: 'ia-tile-actions' }, [el('a', { className: 'ia-btn', href, textContent: action })])])
      overview.append(el('section', { className: 'ia-group' }, [
        el('h2', { textContent: 'Orders, customers and discounts' }),
        el('p', { textContent: 'What has been bought through the Shop, who bought it, the posting of each order, and discount codes.' }),
        el('div', { className: 'ia-tiles' }, [
          tile(BOX, 'Orders', 'Every payment, newest first. Mark orders packed and shipped, add tracking, download a spreadsheet.', ROUTE, 'Open orders'),
          tile(PEOPLE, 'Customers', 'Everyone who has bought or given support: how often, how much, and their orders.', CROUTE, 'Open customers'),
          tile(TAG, 'Discounts', 'Make a discount code: a percentage off, for chosen customers or anyone with the code, for as long as you like.', DROUTE, 'Open discounts'),
        ]),
      ]))
    }
    sync()
    // once logged in, a quiet first look so the number beside Orders is right from the start
    const ready = setInterval(() => {
      if (!document.querySelector('[class*="AppHeader"], [class*="ToolbarContainer"]')) return
      clearInterval(ready)
      if (!state.loaded && !state.loading) load(true)
    }, 500)
  }, 200)
  setTimeout(() => clearInterval(place), 30000)
})()
