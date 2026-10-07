/* JBeatsArt admin: the Orders screen (#/orders), reached from its own place at the foot of the
   left navigation. It lists what has been paid through Stripe (prints from the Shop, and support),
   newest first, with filters, and lets the admin keep track of posting each order: packed,
   shipped (with the carrier and tracking number), delivered. The orders and the tracking live in
   Stripe; api/orders.js reads and writes them for the logged-in admin. */
(() => {
  const ROUTE = '#/orders'
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props)
    kids.forEach((k) => k != null && k !== false && n.append(k))
    return n
  }
  const svg = (d) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true')
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', d); s.append(p)
    return s
  }
  const BOX = 'M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8'

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
  const PERIODS = [['all', 'Any time'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year']]

  const state = { orders: [], more: false, next: null, loaded: false, loading: false, problem: null, view: 'topost', q: '', period: 'all', open: new Set(), keep: new Set(), drafts: {}, saving: {}, saved: {} }

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
  const refresh = el('button', { type: 'button', className: 'ia-btn ghost io-refresh', textContent: 'Refresh' })
  refresh.addEventListener('click', () => load(true))
  const screen = el('main', { className: 'ia-orders' }, [
    el('div', { className: 'ia-home-inner' }, [
      el('div', { className: 'io-top' }, [
        el('div', {}, [
          el('div', { className: 'ia-kicker' }, ['Orders ', testNote]),
          el('h1', { textContent: 'Orders' }),
          el('p', { className: 'ia-lead', textContent: 'Everything paid through Stripe: prints from the Shop and support. Mark each order as you pack and post it; the tracking number goes with it.' }),
        ]),
        refresh,
      ]),
      stats,
      el('div', { className: 'io-bar' }, [chips, el('div', { className: 'io-tools' }, [search, period])]),
      list,
      foot,
    ]),
  ])

  const many = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
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
    // an order saved a moment ago stays in sight until the filter changes, so it does not vanish mid-task
    const shown = all.filter((o) => (inView(o, state.view) || state.keep.has(o.id)) && inPeriod(o) && matches(o))
    list.replaceChildren(...(shown.length ? shown.map(row) : [el('div', { className: 'io-empty' }, [
      el('strong', { textContent: all.length ? 'Nothing here' : 'No orders yet' }),
      el('span', { textContent: all.length ? (state.view === 'topost' ? 'Every paid order has been posted.' : 'Try another filter, or clear the search.') : 'Orders show here as soon as someone pays.' }),
    ])]))
    const moreBtn = el('button', { type: 'button', className: 'ia-btn ghost', textContent: state.loading ? 'Loading…' : 'Load older orders' })
    moreBtn.addEventListener('click', () => load(false))
    foot.replaceChildren(...(state.problem ? [problemBox()] : []), ...(state.more ? [moreBtn] : []))
  }

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
      el('span', { className: 'io-who' }, [el('strong', { textContent: o.name || o.email || 'No name given' }), el('small', { textContent: what })]),
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
      o.refunded > 0 ? el('div', { className: 'io-total is-refund' }, [el('span', { textContent: o.fullyRefunded ? 'Refunded in full' : 'Refunded' }), el('b', { textContent: `−${money(o.refunded, o.currency)}` })]) : null,
      el('p', { className: 'io-when', textContent: when(o.created, true) }),
      el('h4', { textContent: 'Buyer' }),
      el('p', { className: 'io-lines' }, [o.name || '—', o.email ? el('br') : null, o.email ? el('a', { href: `mailto:${o.email}`, textContent: o.email }) : null, o.phone ? el('br') : null, o.phone || null]),
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
      if (ok && said.track) { o.track = said.track; state.drafts[o.id] = { ...said.track }; state.saved[o.id] = { ok: true, text: inView(o, state.view) ? 'Saved' : `Saved. It is now under ${(VIEWS.find(([v]) => v !== 'all' && inView(o, v)) || [, 'All'])[1]}.` }; state.keep.add(o.id) }
      else state.saved[o.id] = { ok: false, text: said.message || 'Not saved. Try again.' }
    } catch { state.saved[o.id] = { ok: false, text: 'Could not reach the site. Try again.' } }
    state.saving[o.id] = false; paint()
    setTimeout(() => { if (state.saved[o.id] && state.saved[o.id].ok) { delete state.saved[o.id]; if (shown()) paint() } }, 2500)
  }

  const load = async (fresh) => {
    if (state.loading) return
    state.loading = true
    if (fresh) { state.problem = null; state.keep.clear(); refresh.textContent = 'Refreshing…' }
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
    state.loading = false; refresh.textContent = 'Refresh'
    paint()
  }

  // ---------- its place in the navigation, with the number still to post
  const count = el('span', { className: 'io-count', hidden: true })
  const link = el('a', { href: ROUTE, className: 'io-nav' }, [svg(BOX), el('span', { textContent: 'Orders' }), count])
  const badge = () => {
    const n = state.orders.filter((o) => inView(o, 'topost')).length
    count.hidden = !n; count.textContent = n > 99 ? '99+' : String(n)
  }
  const shown = () => location.hash === ROUTE
  const sync = () => {
    const on = shown()
    document.documentElement.toggleAttribute('data-ia-orders', on)
    link.classList.toggle('on', on)
    if (on) { document.querySelectorAll('.ia-side nav a.on').forEach((a) => a !== link && a.classList.remove('on')); if (!state.loaded && !state.loading) load(true) }
  }
  addEventListener('hashchange', sync)

  // the left navigation is built once the admin has read its settings; wait for it
  const place = setInterval(() => {
    const scroll = document.querySelector('.ia-side .ia-scroll')
    if (!scroll) return
    clearInterval(place)
    scroll.append(el('div', { className: 'io-divider', role: 'separator' }), el('nav', { ariaLabel: 'Orders' }, [link]))
    document.body.append(screen)
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
