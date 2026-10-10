/* JBeatsArt admin: Commissions and Emails (#/commissions, #/emails), under Orders in the left
   navigation and on the Overview.
   Commissions: every commission asked for on the site (api/commissions.js). One opens in a panel
   with the conversation (live: the site sends each change as it happens), the quote the customer
   accepts and pays in their account, the stages of the work, the finished piece sent to their email,
   and the payment. Emails: news and notices to many customers at once (api/_mailings.js, through
   api/members.js): who, why (a ready-made email for each reason), the words with a live preview, a
   test to yourself, then the send, a few at a time, which can stop and carry on later. */
(() => {
  const CROUTE = '#/commissions'
  const EROUTE = '#/emails'
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
  const CHAT = 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5'
  const MAIL = 'M3 6h18v12H3z M3 7l9 6 9-6'
  const TRASH = 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6'
  const CROSS = 'M6 6l12 12 M18 6L6 18'

  // ---------- talking to the site (the admin's pass; on this computer, the dev server lets it in)
  const pass = () => { try { return JSON.parse(localStorage.getItem('decap-cms-user') || '{}').token || '' } catch { return '' } }
  const post = async (url, body) => {
    try {
      const r = await fetch(url, { method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${pass()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }
    } catch { return { ok: false, status: 0, json: { message: 'Could not reach the site. Check the connection and try again.' } } }
  }
  const cApi = (body) => post('/api/commissions', body)
  const mApi = (body) => post('/api/members', body)

  // ---------- small helpers
  // a currency other than the shop's says which ("$180 USD")
  const money = (n, cur) => { const c = String(cur || cHome || 'AUD').toUpperCase(); try { const s = new Intl.NumberFormat('en-AU', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n) || 0); return c === (cHome || 'AUD') ? s : `${s} ${c}` } catch { return `${n} ${c}` } }
  const date = (t, withTime = false) => new Date(t).toLocaleDateString('en-AU', withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' })
  const ago = (t) => {
    const mins = Math.round((Date.now() - new Date(t)) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
    return date(t)
  }
  const many = (n, one, more = `${one}s`) => `${n} ${n === 1 ? one : more}`
  const button = (text, onClick, cls = 'ia-btn ghost') => { const b = el('button', { type: 'button', className: cls, textContent: text }); b.addEventListener('click', onClick); return b }
  const linked = (text) => {
    const out = []
    String(text || '').split(/(https?:\/\/[^\s<>"]+)/g).forEach((part, i) => out.push(i % 2 ? el('a', { href: part, target: '_blank', rel: 'noopener noreferrer', textContent: part.replace(/^https?:\/\//, '') }) : part))
    return out
  }
  // a window over the screen (Escape, the cross or a click outside closes it)
  const modal = ({ title, content, actions = () => [] }) => {
    const back = el('div', { className: 'io-modal-back' })
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    const close = () => { back.remove(); removeEventListener('keydown', key, true); before?.focus?.() }
    const x = el('button', { type: 'button', className: 'io-icon io-modal-x', ariaLabel: 'Close' }, [svg(CROSS)])
    x.addEventListener('click', close)
    const foot = actions(close)
    const box = el('div', { className: 'io-modal', role: 'dialog', ariaModal: 'true', ariaLabel: title }, [
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
  // "are you sure?": the action runs inside the window, which says so if it fails
  const sure = ({ title, lines, ok = 'Delete', plain = false, run }) => {
    const said = el('p', { className: 'io-modal-error', hidden: true })
    modal({
      title,
      content: [...lines.filter(Boolean).map((l) => el('p', { textContent: l })), said],
      actions: (close) => {
        const no = button('Cancel', close)
        const yes = button(ok, async () => {
          yes.disabled = true; no.disabled = true; yes.textContent = 'Working…'; said.hidden = true
          const problem = await run()
          if (problem) { said.textContent = problem; said.hidden = false; yes.disabled = false; no.disabled = false; yes.textContent = ok } else close()
        }, `ia-btn ${plain ? '' : 'io-danger'}`)
        return [no, yes]
      },
    })
  }


  /* Deleting asks how far it goes. Only from the admin (the default): the customer keeps it in their
     account. Everywhere: gone from their account too, and (ticked by default) they are emailed a copy
     first. `run(scope, copy)` does it and answers '' or what went wrong. */
  const askScope = ({ title, lines, many = false, run }) => {
    const said = el('p', { className: 'io-modal-error', hidden: true })
    let scope = 'admin'
    const copyBox = el('input', { type: 'checkbox', checked: true })
    const copyRow = el('label', { className: 'io-scope-copy' }, [copyBox, el('span', { textContent: `Email them a copy of ${many ? 'their commissions' : 'the commission'} first` })])
    const choice = (value, head, text) => {
      const radio = el('input', { type: 'radio', name: 'io-scope', value, checked: value === scope })
      const row = el('label', { className: `io-scope ${value === scope ? 'on' : ''}` }, [radio, el('strong', { textContent: head }), el('small', { textContent: text })])
      radio.addEventListener('change', () => { scope = value; box.querySelectorAll('.io-scope').forEach((x) => x.classList.toggle('on', x.contains(radio))); copyRow.hidden = scope !== 'everywhere'; yesText() })
      return row
    }
    const box = el('div', { className: 'io-scopes', role: 'radiogroup', ariaLabel: 'How far it goes' }, [
      choice('admin', 'Only from my admin', `It leaves your lists. The customer keeps it in their account: their receipt${'commission' === 'order' ? ', tracking' : ', the conversation'} and what counts toward their rewards.`),
      choice('everywhere', 'From my admin and their account', 'Gone everywhere: for test orders, mistakes or spam. This cannot be undone.'),
    ])
    copyRow.hidden = true
    let yes = null
    const yesText = () => { if (yes) yes.textContent = scope === 'everywhere' ? 'Delete everywhere' : 'Remove from my admin' }
    modal({
      title,
      content: [...lines.filter(Boolean).map((l) => el('p', { textContent: l })), box, copyRow, said],
      actions: (close) => {
        const no = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Cancel' })
        no.addEventListener('click', close)
        yes = el('button', { type: 'button', className: 'ia-btn io-danger' })
        yesText()
        yes.addEventListener('click', async () => {
          yes.disabled = true; no.disabled = true; said.hidden = true
          const label = yes.textContent
          yes.textContent = 'Working…'
          let problem = ''
          try { problem = (await run(scope, scope === 'everywhere' && copyBox.checked)) || '' } catch (e) { problem = e.message }
          if (problem) { said.textContent = problem; said.hidden = false; yes.disabled = false; no.disabled = false; yes.textContent = label } else close()
        })
        return [no, yes]
      },
    })
  }

  // ======================================================================
  // ---------- Commissions
  const C_STATUS = [['requested', 'New'], ['discussing', 'Discussing'], ['quoted', 'Quoted'], ['paid', 'Paid'], ['sketch', 'Sketch'], ['inks', 'Inks'], ['colours', 'Colours'], ['delivered', 'Delivered'], ['complete', 'Received'], ['cancelled', 'Cancelled']]
  const cName = Object.fromEntries(C_STATUS)
  const C_WORK = [['sketch', 'Sketch'], ['inks', 'Inks'], ['colours', 'Colours'], ['delivered', 'Delivered'], ['cancelled', 'Cancel']]
  // what a piece goes through once paid, set on the quote (api/_commissions.js STAGE_SETS)
  const C_SETS = [['sketch', 'Sketch → Delivered (a sketch)', ['sketch', 'delivered']], ['inks', 'Sketch → Inks → Delivered (an inked piece)', ['sketch', 'inks', 'delivered']], ['full', 'Sketch → Inks → Colours → Delivered (full colour)', ['sketch', 'inks', 'colours', 'delivered']]]
  const setWords = (key) => ((C_SETS.find((x) => x[0] === key) || C_SETS[2])[2]).map((k) => cName[k]).join(' → ')
  const C_CHIPS = [
    ['all', 'All', () => true],
    ['unread', 'Unread', (c) => c.unread > 0],
    ['to-answer', 'To quote', (c) => ['requested', 'discussing'].includes(c.status)],
    ['working', 'In the works', (c) => ['paid', 'sketch', 'inks', 'colours'].includes(c.status)],
    ...C_STATUS.map(([k, t]) => [k, t, (c) => c.status === k]),
  ]
  // the currencies a quote can be in, the shop's own first (api/_commissions.js)
  let cCurrencies = ['AUD', 'NZD', 'USD', 'CAD', 'GBP', 'EUR', 'SGD', 'HKD']
  let cHome = 'AUD'
  const CURRENCY_NAMES = { AUD: 'Australian dollars', NZD: 'New Zealand dollars', USD: 'US dollars', CAD: 'Canadian dollars', GBP: 'British pounds', EUR: 'Euros', SGD: 'Singapore dollars', HKD: 'Hong Kong dollars' }
  const cState = { loaded: false, loading: false, list: [], problem: '', chip: 'all', q: '', open: null, detail: null, detailProblem: '', drafts: {}, said: '', saidBad: false, stick: true, deliver: {} }
  const cUnread = () => cState.list.reduce((n, c) => n + (c.unread || 0), 0)

  const loadCommissions = async (quiet = false) => {
    if (cState.loading) return
    cState.loading = true
    if (!quiet) paintC()
    const r = await cApi({ action: 'adminList' })
    cState.loading = false; cState.loaded = true
    if (r.ok) { cState.list = r.json.commissions || []; cState.problem = ''; const s = r.json.settings || {}; if (s.currency) cHome = s.currency; if (Array.isArray(s.currencies) && s.currencies.length) cCurrencies = s.currencies } else cState.problem = r.status === 503 ? 'Commissions need customer accounts and the database (MONGODB_URI), which are not set up yet.' : r.json.message || 'The commissions could not be loaded.'
    paintC(); badge()
  }
  // what the open one shows, to tell whether anything changed (the panel is only drawn again when it did)
  const cKey = (d) => (d ? `${d.id}:${(d.messages || []).length}:${d.status}:${d.updatedAt || ''}:${JSON.stringify(d.quote || null)}:${JSON.stringify(d.payment || null)}` : '')
  const keepCommission = (c) => {
    cState.detail = c
    const row = cState.list.find((x) => x.id === c.id)
    const last = c.messages && c.messages[c.messages.length - 1]
    const fresh = { id: c.id, number: c.number, title: c.title, kind: c.kind, status: c.status, price: c.price, currency: c.currency, ship: c.ship, paid: c.paid, paidWith: c.paidWith, updatedAt: c.updatedAt, lastAt: last ? last.at : c.lastAt, lastFrom: last ? last.from : '', lastText: last ? last.text : '', unread: 0, email: c.email, name: c.name, userId: c.userId, test: c.test, createdAt: c.createdAt, removed: c.removed }
    if (row) Object.assign(row, fresh); else cState.list.unshift(fresh)
  }
  const loadCommission = async (id) => {
    const before = `${cKey(cState.detail)}|${cState.detailProblem}`
    const r = await cApi({ action: 'adminGet', id })
    if (cState.open !== id) return
    if (r.ok) { keepCommission(r.json.commission); cState.detailProblem = '' } else cState.detailProblem = r.json.message || 'It could not be opened.'
    if (`${cKey(cState.detail)}|${cState.detailProblem}` !== before) { paintPanel(); paintC(); badge() }
  }
  const openCommission = (id) => {
    cState.open = id; cState.detail = cState.detail && cState.detail.id === id ? cState.detail : null; cState.detailProblem = ''; cState.said = ''; cState.stick = true
    history.replaceState(null, '', `${CROUTE}?c=${encodeURIComponent(id)}`)
    cFails = 0
    paintPanel(); loadCommission(id); cListen()
  }
  const closeCommission = () => {
    cHush()
    cState.open = null; cState.detail = null
    history.replaceState(null, '', CROUTE)
    paintPanel(); paintC()
  }

  /* The open conversation, live: api/commissions.js sends every change down a line held open
     (Server-Sent Events, read with fetch so the pass goes in the Authorization header, never in an
     address), opened again whenever it ends. A database that cannot do it says so (`fallback`), and a
     line failing three times running gives up: then it is asked for every few seconds instead. */
  let cLive = false
  let cNoWatch = false
  let cLineFor = ''
  let cLine = null
  let cFails = 0
  const cShowing = () => location.hash.startsWith(CROUTE) && document.visibilityState === 'visible'
  const readStream = async (url, signal, onEvent) => {
    const answer = await fetch(url, { headers: { Authorization: `Bearer ${pass()}`, Accept: 'text/event-stream' }, cache: 'no-store', signal })
    if (!answer.ok || !answer.body) throw new Error(`stream ${answer.status}`)
    const reader = answer.body.getReader()
    const decoder = new TextDecoder()
    let held = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      held += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let at
      while ((at = held.indexOf('\n\n')) >= 0) {
        const block = held.slice(0, at)
        held = held.slice(at + 2)
        let event = 'message'
        const data = []
        for (const line of block.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, '')) }
        if (!data.length) continue
        try { onEvent(event, JSON.parse(data.join('\n'))) } catch { /* not ours */ }
      }
    }
  }
  const cHush = () => { cLineFor = ''; cLive = false; if (cLine) { cLine.abort(); cLine = null } }
  const cListen = async () => {
    const id = cState.open
    if (!id || cNoWatch || !cShowing() || cLineFor === id) return
    if (cLineFor) cHush()
    cLineFor = id
    while (cLineFor === id && cState.open === id && !cNoWatch && cShowing()) {
      cLine = new AbortController()
      let heard = false
      try {
        await readStream(`/api/commissions?stream=${encodeURIComponent(id)}&admin=1`, cLine.signal, (event, data) => {
          if (cState.open !== id) return
          if (event === 'commission' && data.commission) {
            heard = true; cLive = true; cFails = 0
            const before = cKey(cState.detail)
            keepCommission(data.commission); cState.detailProblem = ''
            if (cKey(cState.detail) !== before) { paintPanel(); paintC(); badge() }
          } else if (event === 'fallback') cNoWatch = true
          else if (event === 'gone') { cState.detailProblem = 'It is not there any more.'; cState.detail = null; paintPanel() }
        })
      } catch { /* opened again below */ }
      cLive = false
      if (cLineFor !== id || cNoWatch) break
      if (!heard && ++cFails >= 3) break
      await new Promise((resolve) => { setTimeout(resolve, heard ? 200 : 1500 * cFails) })
    }
    if (cLineFor === id) cLineFor = ''
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cListen(); else cHush() })
  // while Commissions shows: the list every 15 seconds; the open one down its live line, or (without
  // one) every 3 seconds (every 10 once nothing has changed for a minute)
  let cQuietSince = Date.now()
  let cSeen = ''
  let cListAt = 0
  const cTick = async () => {
    try {
      if (cShowing()) {
        if (Date.now() - cListAt > 15000) { cListAt = Date.now(); loadCommissions(true) }
        if (cState.open && cFails < 3 && !cNoWatch && cLineFor !== cState.open) cListen()
        if (cState.open && !cLive) {
          await loadCommission(cState.open)
          const k = cKey(cState.detail)
          if (k !== cSeen) { cSeen = k; cQuietSince = Date.now() }
        }
      } else if (cLineFor) cHush()
    } catch { /* again next time */ }
    setTimeout(cTick, Date.now() - cQuietSince > 60000 ? 10000 : 3000)
  }
  setTimeout(cTick, 3000)

  const askDeleteCommission = (c) => askScope({
    title: `Delete commission ${c.number}?`,
    lines: [`${c.name || c.email} · ${c.title} · ${cName[c.status] || c.status}${c.price != null ? ` · ${money(c.price, c.currency)}` : ''}`, c.paid ? 'It is paid: the payment stays in Stripe or PayPal (refund it there if needed).' : ''],
    run: async (scope, copy) => {
      const r = await cApi({ action: 'adminDelete', id: c.id, scope, copy })
      if (!r.ok) return r.json.message || 'Not deleted. Try again.'
      cState.list = cState.list.filter((x) => x.id !== c.id)
      if (cState.open === c.id) closeCommission(); else paintC()
      badge()
      return ''
    },
  })

  // ---------- the Commissions screen
  const cstats = el('div', { className: 'io-stats' })
  const cchips = el('div', { className: 'io-chips', role: 'group', ariaLabel: 'Show' })
  const csearch = el('input', { type: 'search', className: 'io-search', placeholder: 'Number, name, email, piece, message…', ariaLabel: 'Search commissions' })
  csearch.addEventListener('input', () => { cState.q = csearch.value; paintC() })
  const ccount = el('p', { className: 'io-summary' })
  const clist = el('div', { className: 'io-list' })
  const crefresh = button('Refresh', () => loadCommissions())
  const statCard = (n, t, d) => el('div', { className: 'io-stat' }, [el('strong', { textContent: n }), el('span', { textContent: t }), d ? el('small', { textContent: d }) : null])
  const comScreen = el('main', { className: 'ia-orders is-commissions' }, [
    el('div', { className: 'ia-home-inner' }, [
      el('div', { className: 'io-top' }, [
        el('div', {}, [
          el('div', { className: 'ia-kicker', textContent: 'Orders' }),
          el('h1', { textContent: 'Commissions' }),
          el('p', { className: 'ia-lead', textContent: 'Pieces asked for on the Commissions page. Talk each one over with the customer, send a quote (they accept and pay it in their account), then move it through Sketch, Inks, Colours and Delivered: they see every step, and get an email.' }),
        ]),
        el('div', { className: 'io-actions' }, [crefresh]),
      ]),
      cstats,
      el('div', { className: 'io-bar' }, [cchips, el('div', { className: 'io-tools' }, [csearch])]),
      ccount,
      clist,
    ]),
  ])
  const filtered = () => {
    const chip = C_CHIPS.find((x) => x[0] === cState.chip) || C_CHIPS[0]
    const q = cState.q.trim().toLowerCase()
    return cState.list.filter((c) => chip[2](c) && (!q || [c.number, c.name, c.email, c.title, c.kind, c.lastText].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.unread > 0) - (a.unread > 0) || new Date(b.lastAt || b.updatedAt) - new Date(a.lastAt || a.updatedAt))
  }
  const paintC = () => {
    const all = cState.list
    crefresh.textContent = cState.loading ? 'Loading…' : 'Refresh'
    const working = all.filter((c) => ['paid', 'sketch', 'inks', 'colours'].includes(c.status))
    const paidSum = all.filter((c) => c.paid && c.status !== 'cancelled').reduce((t, c) => t + (Number(c.price) || 0), 0)
    const cur = (all.find((c) => c.currency) || {}).currency || 'AUD'
    cstats.replaceChildren(
      statCard(String(cUnread()), 'Unread', cUnread() ? 'messages waiting' : 'all read'),
      statCard(String(all.filter(C_CHIPS[2][2]).length), 'To quote', 'new or being talked over'),
      statCard(String(working.length), 'In the works', 'paid, not delivered'),
      statCard(money(paidSum, cur), 'Paid', many(all.filter((c) => c.paid).length, 'commission')),
    )
    cchips.replaceChildren(...C_CHIPS.map(([k, label, test]) => {
      const n = all.filter(test).length
      if (n === 0 && !['all', 'unread', 'to-answer'].includes(k) && cState.chip !== k) return null
      const b = el('button', { type: 'button', className: `io-chip ${cState.chip === k ? 'on' : ''} ${k === 'unread' && n ? 'is-hot' : ''}`, ariaPressed: String(cState.chip === k) }, [label, el('small', { textContent: String(n) })])
      b.addEventListener('click', () => { cState.chip = k; paintC() })
      return b
    }).filter(Boolean))
    const list = filtered()
    ccount.textContent = cState.loading && !cState.loaded ? 'Loading the commissions…' : `${list.length === all.length ? 'All' : `${list.length} of`} ${many(all.length, 'commission')}`
    if (cState.problem) { clist.replaceChildren(el('div', { className: 'io-empty' }, [el('strong', { textContent: 'The commissions could not be loaded' }), el('span', { textContent: cState.problem })])); return }
    if (!list.length) {
      clist.replaceChildren(el('div', { className: 'io-empty' }, [el('strong', { textContent: all.length ? 'None match' : cState.loaded ? 'No commissions yet' : 'Loading…' }), el('span', { textContent: all.length ? 'Try another filter, or clear the search.' : 'Requests made on the Commissions page (by customers logged in to their account) show up here.' })]))
      return
    }
    clist.replaceChildren(...list.map((c) => {
      const head = el('button', { type: 'button', className: `ic-row ${cState.open === c.id ? 'on' : ''} ${c.unread ? 'is-unread' : ''}` }, [
        el('span', { className: 'ic-no' }, [el('strong', { textContent: c.number }), el('small', { textContent: date(c.createdAt) })]),
        el('span', { className: 'ic-who' }, [el('strong', { textContent: c.name || c.email || '—' }), el('small', { textContent: `${c.title}${c.kind ? ` · ${c.kind}` : ''}` })]),
        el('span', { className: 'ic-last' }, [el('small', { textContent: `${c.lastFrom === 'artist' ? 'You: ' : ''}${c.lastText || ''}` }), el('em', { textContent: ago(c.lastAt || c.updatedAt) })]),
        el('span', { className: 'ic-price' }, [el('strong', { textContent: c.price != null ? money(c.price, c.currency) : '—' }), el('small', { textContent: c.paid ? (c.paidWith ? `Paid · ${c.paidWith}` : 'Paid') : c.price != null ? 'Not paid yet' : 'No quote yet' })]),
        el('span', { className: `io-pill ic-pill is-${c.status}`, textContent: cName[c.status] || c.status }),
        c.unread ? el('b', { className: 'ic-unread', textContent: String(c.unread), ariaLabel: `${c.unread} unread` }) : el('i'),
      ])
      head.addEventListener('click', () => openCommission(c.id))
      const del = el('button', { type: 'button', className: 'io-icon is-danger', ariaLabel: `Delete commission ${c.number}`, title: 'Delete' }, [svg(TRASH)])
      del.addEventListener('click', () => askDeleteCommission(c))
      return el('div', { className: 'ic-line' }, [head, del])
    }))
  }

  // ---------- one commission, in a panel at the side
  const shade = el('div', { className: 'ic-shade' })
  shade.addEventListener('click', () => closeCommission())
  const panel = el('aside', { className: 'ic-panel', role: 'dialog', ariaModal: 'true', ariaLabel: 'Commission' })
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && cState.open && !document.querySelector('.io-modal-back')) closeCommission() })
  const CHUNK = 3 * 1048576
  const CAP = 20 * 1048576
  const sizeOf = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
  const b64 = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(new Error('A file could not be read.')); r.readAsDataURL(blob) })
  const quoteNote = (q) => el('div', { className: 'ic-qnote' }, [
    el('span', { className: 'ic-qnote-tag', textContent: 'Quote' }),
    el('strong', { textContent: money(q.price, q.currency) }),
    el('p', {}, linked(q.includes)),
    el('small', { textContent: [q.due ? `Ready by ${date(q.due)}` : '', q.ship ? 'Posted to them' : 'Digital', setWords(q.stages || 'full')].filter(Boolean).join(' · ') }),
  ])
  const paintPanel = () => {
    const open = Boolean(cState.open)
    document.documentElement.toggleAttribute('data-ic-open', open)
    if (!open) { panel.replaceChildren(); return }
    // what is being typed stays, with the caret, while the panel is drawn again
    const focused = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset.draft : ''
    const caret = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null
    const oldBody = panel.querySelector('.ic-body')
    const keepTop = oldBody ? oldBody.scrollTop : 0
    const id = cState.open
    const c = cState.detail
    const draft = cState.drafts[id] || (cState.drafts[id] = {})
    const said = el('p', { className: `ic-said ${cState.saidBad ? 'is-bad' : ''}`, role: 'status', textContent: cState.said })
    const fail = (r) => { said.classList.add('is-bad'); said.textContent = r.json.message || 'That did not work. Try again.' }
    const run = async (btn, body, done) => {
      btn.disabled = true; said.classList.remove('is-bad'); said.textContent = 'Saving…'
      const r = await cApi({ id, ...body })
      btn.disabled = false
      if (!r.ok) return fail(r)
      cState.saidBad = false
      keepCommission(r.json.commission); done(); cState.stick = true
      paintPanel(); paintC()
    }
    const input = (key, props, tag = 'input') => {
      const n = el(tag, { className: 'io-input', ...props })
      n.dataset.draft = key
      if (draft[key] !== undefined) { if (props.type === 'checkbox') n.checked = draft[key]; else n.value = draft[key] }
      n.addEventListener(props.type === 'checkbox' ? 'change' : 'input', () => { draft[key] = props.type === 'checkbox' ? n.checked : n.value })
      return n
    }
    const x = el('button', { type: 'button', className: 'io-icon', ariaLabel: 'Close' }, [svg(CROSS)])
    x.addEventListener('click', closeCommission)
    if (!c) {
      panel.replaceChildren(el('header', { className: 'ic-head' }, [el('div', {}, [el('div', { className: 'ia-kicker', textContent: 'Commission' }), el('h2', { textContent: cState.detailProblem ? 'Not found' : 'Opening…' })]), x]), el('div', { className: 'ic-body' }, [cState.detailProblem ? el('p', { className: 'ic-said is-bad', textContent: cState.detailProblem }) : null]))
      return
    }
    const block = (title, kids, cls = '') => el('section', { className: `ic-block ${cls}` }, [el('h3', { textContent: title }), ...kids])
    const paid = Boolean(c.payment && c.payment.paidAt)
    const d = c.details || {}
    const first = (c.name || 'them').split(' ')[0]

    // the conversation: the customer on the left, you on the right, the site's notes in the middle
    const thread = el('div', { className: 'ic-thread' }, (c.messages || []).map((m) => el('div', { className: `ic-msg is-${m.from}` }, [
      m.from !== 'system' ? el('span', { className: 'ic-msg-who', textContent: m.from === 'artist' ? 'You' : first }) : null,
      m.kind === 'quote' && m.quote ? quoteNote(m.quote) : el('div', { className: 'ic-bubble' }, [
        m.text ? el('p', {}, linked(m.text)) : null,
        m.links && m.links.length ? el('ul', { className: 'ic-links' }, m.links.map((l) => el('li', {}, [el('a', { href: l, target: '_blank', rel: 'noopener noreferrer', textContent: l.replace(/^https?:\/\//, '') })]))) : null,
      ]),
      el('time', { textContent: date(m.at, true) }),
    ])))
    thread.addEventListener('scroll', () => { cState.stick = thread.scrollTop + thread.clientHeight >= thread.scrollHeight - 30 })
    const reply = input('reply', { placeholder: `Write to ${first}…`, rows: 3, maxLength: 4000, ariaLabel: 'Your message' }, 'textarea')
    const links = input('links', { placeholder: 'Links (optional): paste one or more', maxLength: 2000, ariaLabel: 'Links' })
    const send = button('Send', () => {
      if (!(draft.reply || '').trim() && !(draft.links || '').trim()) { reply.focus(); return }
      run(send, { action: 'adminMessage', text: draft.reply || '', links: String(draft.links || '').split(/[\s,]+/).filter(Boolean) }, () => { draft.reply = ''; draft.links = ''; cState.said = 'Sent ✓' })
    }, 'ia-btn ic-go')
    reply.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send.click() })

    // the quote: price, what it includes, the stages, when, and whether it is posted
    const q = c.quote
    const price = input('price', { type: 'number', min: '1', step: '1', inputMode: 'decimal', value: q ? String(q.price) : '', placeholder: 'For example 250' })
    // the currency: the shop's own unless another is picked (a quote sent before keeps its own)
    const curWant = draft.currency ?? ((q && q.currency) || cHome)
    const curSel = el('select', { className: 'io-select ic-cur', ariaLabel: 'Currency' }, cCurrencies.map((k) => el('option', { value: k, textContent: `${k}${k === cHome ? ' (your currency)' : CURRENCY_NAMES[k] ? ` · ${CURRENCY_NAMES[k]}` : ''}`, selected: k === curWant })))
    curSel.addEventListener('change', () => { draft.currency = curSel.value; curNote.hidden = curSel.value === cHome })
    const curNote = el('small', { className: 'ic-cur-note', textContent: 'They pay in this currency; Stripe or PayPal pays it out to you in yours.', hidden: curWant === cHome })
    const includes = input('includes', { rows: 3, maxLength: 1000, value: q ? q.includes : '', placeholder: 'For example: A3 full colour, signed, high-resolution file' }, 'textarea')
    const stageWant = draft.stages ?? ((q && q.stages) || c.suggestedStages || 'full')
    const stageSel = el('select', { className: 'io-select' }, C_SETS.map(([k, t]) => el('option', { value: k, textContent: t, selected: k === stageWant })))
    stageSel.addEventListener('change', () => { draft.stages = stageSel.value })
    const due = input('due', { type: 'date', value: q && q.due ? String(q.due).slice(0, 10) : '' })
    // how it reaches them: digital (the file by email) or posted (the checkout asks for an address)
    const shipNow = draft.ship ?? (q ? Boolean(q.ship) : false)
    const way = (posted, title, text) => {
      const radio = el('input', { type: 'radio', name: `ship-${id}`, value: posted ? 'posted' : 'digital', checked: shipNow === posted, className: 'ic-way-box' })
      radio.addEventListener('change', () => { if (radio.checked) { draft.ship = posted; wayRow.querySelectorAll('.ic-way').forEach((w) => w.classList.toggle('on', w.contains(radio))) } })
      return el('label', { className: `ic-way ${shipNow === posted ? 'on' : ''}` }, [radio, el('strong', { textContent: title }), el('small', { textContent: text })])
    }
    const wayRow = el('div', { className: 'ic-ways', role: 'radiogroup', ariaLabel: 'How it reaches them' })
    wayRow.append(
      way(false, 'Digital', 'The finished file is emailed to them. No address needed.'),
      way(true, 'Posted', 'A physical piece in the mail. The checkout asks for their address.'),
    )
    const sendQuote = button(q ? 'Send the new quote' : 'Send quote', () => {
      const p = Number(draft.price ?? price.value)
      if (!(p >= 1)) { said.classList.add('is-bad'); said.textContent = 'Put a price first.'; price.focus(); return }
      if (!String(draft.includes ?? includes.value).trim()) { said.classList.add('is-bad'); said.textContent = 'Say what the price includes.'; includes.focus(); return }
      run(sendQuote, { action: 'adminQuote', price: p, includes: draft.includes ?? includes.value, due: draft.due ?? due.value, ship: Boolean(draft.ship ?? shipNow), stages: stageSel.value, currency: curSel.value }, () => { ['price', 'includes', 'due', 'ship', 'stages', 'currency'].forEach((k) => delete draft[k]); cState.said = 'Quote sent ✓ They have an email.' })
    }, 'ia-btn ic-go')
    const field = (label, control, req = false, hint = '') => el('label', { className: 'ic-field' }, [el('span', {}, [label, req ? el('b', { className: 'ic-req', textContent: ' *', ariaHidden: 'true' }) : null]), control, hint ? el('small', { textContent: hint }) : null])
    const quoteForm = el('div', { className: 'ic-quote-form' }, [
      el('div', { className: 'ic-pair' }, [el('div', { className: 'ic-field' }, [el('span', {}, ['Price', el('b', { className: 'ic-req', textContent: ' *', ariaHidden: 'true' })]), el('div', { className: 'ic-price' }, [price, curSel]), curNote]), field('Ready by (optional)', due)]),
      field('What is included', includes, true),
      field('What the piece goes through', stageSel, true, `Their tracker shows only these stages. Picked from what they asked for (${d.kind || 'the kind of piece'}); change it if needed.`),
      el('div', { className: 'ic-field' }, [el('span', {}, ['How it reaches them', el('b', { className: 'ic-req', textContent: ' *', ariaHidden: 'true' })]), wayRow]),
      el('div', { className: 'ic-save' }, [sendQuote, el('small', { textContent: 'Full price, paid up front. They accept and pay it in their account (card or PayPal, with a discount code if they have one).' })]),
    ])
    const quoteNow = q ? el('div', { className: 'ic-quote-now' }, [
      el('strong', { textContent: money(q.price, q.currency) }),
      el('span', {}, linked(q.includes)),
      el('small', { textContent: [q.due ? `Ready by ${date(q.due)}` : '', q.ship ? 'Posted to them' : 'Digital', setWords(q.stages || 'full'), `sent ${date(q.at, true)}`].filter(Boolean).join(' · ') }),
    ]) : null

    // the stages of the work: once it is paid (cancel any time)
    const note = input('note', { placeholder: 'A note for them with the step (optional)', maxLength: 2000 })
    const goesThrough = c.stages || ['sketch', 'inks', 'colours', 'delivered']
    const stages = el('div', { className: 'ic-stages', role: 'group', ariaLabel: 'Stage' }, C_WORK.filter(([k]) => k === 'cancelled' || goesThrough.includes(k)).map(([k, t]) => {
      const on = c.status === k
      const b = el('button', { type: 'button', className: `ic-stage is-${k} ${on ? 'on' : ''}`, textContent: t, disabled: (k !== 'cancelled' && !paid) && !on, ariaPressed: String(on) })
      b.addEventListener('click', () => {
        if (on) return
        const go = () => run(b, { action: 'adminStage', status: k, note: draft.note || '' }, () => { draft.note = ''; cState.said = `${cName[k]} ✓ They have an email.` })
        if (k === 'cancelled') sure({ title: `Cancel commission ${c.number}?`, lines: [`${c.name || c.email} · ${c.title}`, paid ? 'It is paid: cancelling does not refund it. Refund it in Stripe or PayPal, then tell them here.' : 'They see it cancelled in their account, and get an email. An open checkout for it is closed.'], ok: 'Cancel it', run: async () => { await go(); return '' } })
        else go()
      })
      return b
    }))

    // the finished piece, sent to their email: the files go up in pieces of 3 MB (20 MB in all), then one email carries them
    const dv = cState.deliver[id] || (cState.deliver[id] = { files: [], busy: false, progress: '' })
    const deliver = async () => {
      if (dv.busy) return
      const upload = Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) => n.toString(16).padStart(2, '0')).join('')
      dv.busy = true; cState.said = ''; cState.saidBad = false
      try {
        for (const [fi, f] of dv.files.entries()) {
          const total = Math.max(1, Math.ceil(f.size / CHUNK))
          for (let i = 0; i < total; i++) {
            dv.progress = `Uploading ${f.name}${total > 1 ? ` (${i + 1} of ${total})` : ''}…`; paintPanel()
            const r = await cApi({ action: 'adminFileChunk', id, upload, file: fi, name: f.name, type: f.type, index: i, total, data: await b64(f.slice(i * CHUNK, (i + 1) * CHUNK)) })
            if (!r.ok) throw new Error(r.json.message || 'A file could not be sent. Try again.')
          }
        }
        dv.progress = 'Emailing it to them…'; paintPanel()
        const r = await cApi({ action: 'adminDeliver', id, upload, note: draft.dnote || '', link: draft.dlink || '' })
        if (!r.ok) throw new Error(r.json.message || 'It could not be sent. Try again.')
        keepCommission(r.json.commission)
        cState.said = `Sent to ${c.email} ✓${r.json.sent && r.json.sent.length ? ` (${r.json.sent.join(', ')})` : ''}`
        dv.files = []; draft.dnote = ''; draft.dlink = ''; cState.stick = true
      } catch (e) { cState.said = e.message; cState.saidBad = true }
      dv.busy = false; dv.progress = ''
      paintPanel(); paintC()
    }
    const deliverBlock = () => {
      const total = dv.files.reduce((n, f) => n + f.size, 0)
      const over = total > CAP
      const picker = el('input', { type: 'file', multiple: true, className: 'ic-file', accept: 'image/*,application/pdf,application/zip,.zip,.psd,.tif,.tiff', disabled: dv.busy, ariaLabel: 'The finished files' })
      picker.addEventListener('change', () => { dv.files.push(...picker.files); paintPanel() })
      const dnote = input('dnote', { rows: 2, maxLength: 2000, placeholder: 'A note with it (optional)', ariaLabel: 'A note with it' }, 'textarea')
      const dlink = input('dlink', { placeholder: 'https://… (Google Drive, WeTransfer)', maxLength: 500, ariaLabel: 'Download link' })
      const go = button(dv.busy ? dv.progress || 'Sending…' : 'Send to their email', deliver, 'ia-btn ic-go')
      go.disabled = dv.busy || over || (!dv.files.length && !String(draft.dlink || '').trim())
      dlink.addEventListener('input', () => { go.disabled = dv.busy || over || (!dv.files.length && !dlink.value.trim()) })
      return [
        field('The finished files (images, PDF or zip)', picker, false, 'Choose one or more. Up to 20 MB in all, sent attached to one email.'),
        dv.files.length ? el('ul', { className: 'ic-files' }, dv.files.map((f, i) => {
          const rm = button('×', () => { dv.files.splice(i, 1); paintPanel() }, 'io-icon')
          rm.setAttribute('aria-label', `Remove ${f.name}`); rm.disabled = dv.busy
          return el('li', {}, [el('span', { textContent: f.name }), el('small', { textContent: sizeOf(f.size) }), rm])
        })) : null,
        dv.files.length ? el('p', { className: `ic-files-total ${over ? 'is-over' : ''}`, textContent: over ? `${sizeOf(total)} in all: over 20 MB, too big for an email. Remove some, or put them in Google Drive or WeTransfer and send the link below.` : `${many(dv.files.length, 'file')}, ${sizeOf(total)} in all` }) : null,
        field('A note (optional)', dnote),
        field('A download link for big files (optional)', dlink),
        el('div', { className: 'ic-save' }, [go, el('small', { textContent: c.status === 'complete' ? 'They have confirmed it already: this only sends the files.' : 'It is marked Delivered, with a note in the conversation. They confirm when they have it.' })]),
      ]
    }

    const p = c.payment
    const stripeLink = p && p.provider === 'stripe' && p.pi ? `https://dashboard.stripe.com/${p.test ? 'test/' : ''}payments/${p.pi}` : ''
    const paypalLink = p && p.provider === 'paypal' && p.captureId ? `https://www.${p.test ? 'sandbox.' : ''}paypal.com/activity/payment/${p.captureId}` : ''
    const a = c.address
    const reopen = () => sure({ title: `Reopen ${c.number}?`, lines: [`${c.name || c.email} · ${c.title}`, 'It goes back to Delivered and you can write to each other again. They get an email saying so.'], ok: 'Reopen it', plain: true, run: async () => { const r = await cApi({ action: 'adminReopen', id }); if (!r.ok) return r.json.message || 'Not reopened. Try again.'; keepCommission(r.json.commission); cState.said = 'Reopened ✓'; paintPanel(); paintC(); return '' } })
    panel.replaceChildren(
      el('header', { className: 'ic-head' }, [
        el('div', {}, [
          el('div', { className: 'ia-kicker', textContent: `Asked ${date(c.createdAt, true)}` }),
          el('h2', { textContent: c.number }),
          el('p', { className: 'ic-sub', textContent: c.title }),
          el('div', { className: 'ic-tags' }, [el('span', { className: `io-pill ic-pill is-${c.status}`, textContent: cName[c.status] || c.status }), paid ? el('span', { className: 'io-pill is-delivered', textContent: p.refunded ? 'Refunded' : 'Paid' }) : null, c.test ? el('span', { className: 'io-pill', textContent: 'Test' }) : null, c.removed ? el('span', { className: 'io-pill', textContent: 'Removed by the customer' }) : null]),
        ]),
        x,
      ]),
      el('div', { className: 'ic-body' }, [
        el('section', { className: 'ic-block ic-person' }, [
          el('strong', { textContent: c.name || '—' }),
          el('a', { href: `mailto:${c.email}`, textContent: c.email }),
        ]),
        block('Conversation', [thread, c.status === 'complete'
          ? el('div', { className: 'ic-closed' }, [el('p', { textContent: `Complete — confirmed by the customer${c.completedAt ? ` on ${date(c.completedAt)}` : ''}; the conversation is closed.` }), button('Reopen conversation', reopen)])
          : c.status === 'cancelled'
            ? el('div', { className: 'ic-closed' }, [el('p', { textContent: 'Cancelled — the conversation is closed.' })])
            : el('div', { className: 'ic-reply' }, [reply, links, el('div', { className: 'ic-save' }, [send, el('small', { textContent: 'They see it in their account and get an email.' })])])]),
        block('What they asked for', [el('dl', { className: 'ic-dl' }, [
          el('dt', { textContent: 'Kind' }), el('dd', { textContent: d.kind || '—' }),
          d.size ? el('dt', { textContent: 'Size' }) : null, d.size ? el('dd', { textContent: d.size }) : null,
          d.budget ? el('dt', { textContent: 'Budget' }) : null, d.budget ? el('dd', { textContent: d.budget }) : null,
          el('dt', { textContent: 'Needed by' }), el('dd', { textContent: d.due || 'No deadline' }),
          el('dt', { textContent: 'The idea' }), el('dd', {}, linked(d.idea)),
          d.refs && d.refs.length ? el('dt', { textContent: 'References' }) : null,
          d.refs && d.refs.length ? el('dd', {}, d.refs.map((l) => el('a', { href: l, target: '_blank', rel: 'noopener noreferrer', textContent: l.replace(/^https?:\/\//, '') }))) : null,
        ])]),
        block('Quote', paid || c.status === 'cancelled' ? [quoteNow || el('p', { className: 'ic-dim', textContent: 'No quote was sent.' })] : [quoteNow, quoteForm].filter(Boolean)),
        block('Stage', c.status === 'complete'
          ? [el('p', { className: 'ic-dim', textContent: `Complete: they confirmed they received it${c.completedAt ? ` on ${date(c.completedAt)}` : ''}.` })]
          : [stages, note, el('small', { className: 'ic-hint', textContent: paid ? 'Each step is saved at once, with a note in the conversation and an email to them. Delivered: send the files below.' : 'The work stages open once it is paid.' })]),
        paid && c.status !== 'cancelled' ? block('Upload the finished piece', deliverBlock(), 'ic-deliver') : null,
        block('Payment', p && p.paidAt ? [
          el('ul', { className: 'io-items' }, [
            el('li', {}, [el('span', { textContent: 'Paid with' }), el('b', { textContent: p.paidWith || (p.provider === 'paypal' ? 'PayPal' : 'Card') })]),
            el('li', {}, [el('span', { textContent: 'Paid' }), el('b', { textContent: money(p.amount, p.currency) })]),
            p.code ? el('li', {}, [el('span', { textContent: `Code ${p.code}` }), el('b', { textContent: `− ${money(p.discount || 0, p.currency)}` })]) : null,
          ]),
          el('p', { className: 'ic-dim', textContent: `${date(p.paidAt, true)}${p.test ? ' · test payment' : ''}${p.refunded ? ' · refunded' : ''}` }),
          a ? el('p', { className: 'io-lines' }, [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean).flatMap((line, i) => (i ? [el('br'), line] : [line]))) : el('p', { className: 'ic-dim', textContent: c.quote && c.quote.ship ? 'No address came with the payment.' : 'Digital: nothing to post.' }),
          stripeLink || paypalLink ? el('a', { className: 'ia-btn ghost', href: stripeLink || paypalLink, target: '_blank', rel: 'noopener', textContent: stripeLink ? 'Open in Stripe ↗' : 'Open in PayPal ↗' }) : null,
        ] : [el('p', { className: 'ic-dim', textContent: c.pending ? `A ${c.pending.provider === 'paypal' ? 'PayPal' : 'card'} checkout was opened ${date(c.pending.at, true)}; not paid yet.` : 'Not paid yet.' })]),
        el('section', { className: 'ic-block' }, [button('Delete this commission', () => askDeleteCommission(c), 'ia-btn ghost io-danger-ghost')]),
      ]),
      el('footer', { className: 'ic-foot' }, [said]),
    )
    const body = panel.querySelector('.ic-body')
    body.scrollTop = keepTop
    requestAnimationFrame(() => { if (cState.stick) thread.scrollTop = thread.scrollHeight })
    if (focused) {
      const again = panel.querySelector(`[data-draft="${focused}"]`)
      if (again) { again.focus(); try { if (caret && caret[0] != null) again.setSelectionRange(caret[0], caret[1]) } catch { /* not a text field */ } }
    }
  }

  // ======================================================================
  // ---------- Emails
  const eState = { loaded: false, loading: false, problem: '', info: null, codes: [], audience: 'news', fields: null, touched: false, html: '', run: null, note: null }
  const SOCIAL = { instagram: 'Link to the post', youtube: 'Link to the video', discord: 'Link to the server or event' }
  const AUDIENCE_SHORT = { news: 'Agreed to news', all: 'All accounts' }
  const reasonName = (k) => (eState.info && eState.info.templates[k] && eState.info.templates[k].label) || k
  const loadMailInfo = async () => {
    eState.loading = true; paintE()
    const r = await mApi({ action: 'adminMailInfo' })
    eState.loading = false; eState.loaded = true
    if (r.ok) { eState.info = r.json; eState.problem = '' } else eState.problem = r.status === 503 ? 'Customer accounts are not set up on this site (MONGODB_URI), so there is nobody to email.' : r.json.message || 'The emails screen could not be loaded.'
    paintE()
    // the shared discount codes, for a "new discount" email
    try {
      const d = await fetch('/api/discounts', { cache: 'no-store', headers: { Authorization: `Bearer ${pass()}` } }).then((x) => x.json())
      const now = Date.now() / 1000
      eState.codes = (d.discounts || []).filter((x) => x.active && !x.email && !(x.until && x.until < now) && !(x.uses && x.used >= x.uses))
      if (eState.fields && eState.fields.reason === 'discount') paintE()
    } catch { /* none to pick */ }
  }
  const countFor = (a) => (eState.info ? eState.info.counts[a] || 0 : 0)
  // the email as the site draws it, a moment after the last change
  let previewTimer = 0
  let previewGen = 0
  const preview = () => {
    clearTimeout(previewTimer)
    previewTimer = setTimeout(async () => {
      if (!eState.fields) return
      const gen = ++previewGen
      const r = await mApi({ action: 'adminMailPreview', fields: eState.fields, audience: eState.audience })
      if (gen !== previewGen || !r.ok) return
      eState.html = r.json.html || ''
      const frame = emailScreen.querySelector('.ie-frame')
      if (frame && frame.srcdoc !== eState.html) frame.srcdoc = eState.html
    }, 300)
  }
  const applyTemplate = (reason) => {
    const t = eState.info.templates[reason]
    if (!t) return
    const { label: _label, ...fields } = t
    eState.fields = { ...fields, pieces: [], discount: null, event: null }
    eState.touched = false; eState.note = null
    paintE(); preview()
  }
  const pickReason = (reason) => {
    if (!reason) return
    if (eState.fields && eState.touched && reason !== eState.fields.reason) {
      sure({ title: 'Start from the ready-made email?', lines: [`${reasonName(reason)}: a ready-made email.`, 'What you have written so far is replaced by its words.'], ok: 'Use it', plain: true, run: async () => { applyTemplate(reason); return '' } })
      paintE()
      return
    }
    applyTemplate(reason)
  }
  const mailInput = (key, props = {}, area = false) => {
    const i = el(area ? 'textarea' : 'input', { className: 'io-input', value: eState.fields[key] || '', ...(area ? { rows: 6 } : { type: 'text' }), ...props })
    i.dataset.draft = `mail-${key}`
    i.addEventListener('input', () => { eState.fields[key] = i.value; eState.touched = true; preview() })
    return i
  }
  const efield = (t, control) => el('label', { className: 'ic-field' }, [el('span', { textContent: t }), control])
  const hint = (t) => el('p', { className: 'ic-hint', textContent: t })
  // the reason's own part: the code, the pieces, the link, the convention
  const extras = () => {
    const f = eState.fields
    const r = f.reason
    if (r === 'discount') {
      const s = el('select', { className: 'io-select', ariaLabel: 'Discount code' }, [
        el('option', { value: '', textContent: eState.codes.length ? 'Pick a code…' : 'No shared codes running' }),
        ...eState.codes.map((d) => el('option', { value: d.id, textContent: `${d.code} · ${d.percent}% off · ${d.until ? `until ${date(d.until * 1000)}` : 'no end date'}`, selected: Boolean(f.discount && f.discount.code === d.code) })),
      ])
      s.addEventListener('change', () => { const d = eState.codes.find((x) => x.id === s.value); f.discount = d ? { code: d.code, percent: d.percent, until: d.until || null } : null; eState.touched = true; preview() })
      return [efield('The code', s), hint('Only codes for anyone (one shared code) that are still running. Make one under Discounts → Anyone with the code. In the words, {percent}, {code} and {until} stand for it.')]
    }
    if (r === 'pieces') {
      const all = eState.info.pieces
      const count = el('span', { className: 'ie-chosen', textContent: `${f.pieces.length} of 4 chosen` })
      const box = el('div', { className: 'ie-pieces' }, all.length ? all.map((p) => {
        const box_ = el('input', { type: 'checkbox', checked: f.pieces.includes(p.slug) })
        const row = el('label', { className: `ie-piece ${f.pieces.includes(p.slug) ? 'on' : ''}` }, [box_, el('img', { src: p.src, alt: '', loading: 'lazy' }), el('span', {}, [el('strong', { textContent: p.title }), el('small', { textContent: [p.price, p.date ? date(p.date) : ''].filter(Boolean).join(' · ') })])])
        box_.addEventListener('change', () => {
          if (box_.checked && f.pieces.length >= 4) { box_.checked = false; count.textContent = 'Four at most'; return }
          f.pieces = box_.checked ? [...f.pieces, p.slug] : f.pieces.filter((x) => x !== p.slug)
          row.classList.toggle('on', box_.checked); count.textContent = `${f.pieces.length} of 4 chosen`; eState.touched = true; preview()
        })
        return row
      }) : [el('p', { className: 'ic-dim', textContent: 'Nothing is in the shop just now.' })])
      return [el('div', { className: 'ie-pick-top' }, [count, el('small', { className: 'ic-hint', textContent: 'Newest first. Each shows with its picture, name and price.' })]), box]
    }
    if (SOCIAL[r]) return [efield(SOCIAL[r], mailInput('buttonUrl', { placeholder: 'https://…', spellcheck: false })), hint('The button in the email opens it. Filled in from your social links (Site → Brand & contact) when there is one: paste the link to the new one.')]
    if (r === 'event') {
      const ev = f.event || {}
      const list = eState.info.events
      const s = list.length ? el('select', { className: 'io-select', ariaLabel: 'Convention' }, [el('option', { value: '', textContent: 'Pick one of your conventions…' }), ...list.map((e) => el('option', { value: e.slug, textContent: [e.name, e.when].filter(Boolean).join(' · '), selected: ev.name === e.name }))]) : null
      if (s) s.addEventListener('change', () => { const e = list.find((x) => x.slug === s.value); if (!e) return; f.event = { name: e.name, when: e.when, place: e.place, role: e.role }; if (e.url) f.buttonUrl = e.url; eState.touched = true; paintE(); preview() })
      const part = (k, label, ph) => {
        const i = el('input', { type: 'text', className: 'io-input', value: ev[k] || '', placeholder: ph, maxLength: 120 })
        i.dataset.draft = `mail-event-${k}`
        i.addEventListener('input', () => { f.event = { ...(f.event || {}), [k]: i.value }; eState.touched = true; preview() })
        return efield(label, i)
      }
      return [s ? efield('From Conventions', s) : hint('No conventions on the site yet: type the details here (or add it under Conventions).'),
        el('div', { className: 'ic-pair' }, [part('name', 'Name', 'Supanova Gold Coast'), part('when', 'When', '14–15 Nov 2026'), part('place', 'Where', 'Gold Coast'), part('role', 'Where to find you there', 'Artist Alley, table 42')]),
        hint('Shown in a box in the email. In the words, {event} stands for its name.')]
    }
    return [hint(r === 'commissions' ? 'The button opens the commission request card on your site.' : 'Nothing more to pick: write your news below.')]
  }
  // sending: a few at a time, until done, stopped, or the day's limit
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const runMailing = async (m) => {
    if (eState.run && eState.run.going) return
    const run = eState.run = { going: true, stop: false, mailing: m, message: '', capped: false }
    paintE()
    let busy = 0
    while (!run.stop) {
      const r = await mApi({ action: 'adminMailSend', id: m.id })
      if (r.json.mailing) run.mailing = r.json.mailing
      if (r.json.today && eState.info) eState.info.today = r.json.today
      if (r.status === 409 && busy++ < 10) { await sleep(3000); continue }
      if (!r.ok) { run.message = r.json.message || 'Sending stopped: the site did not answer. Resume it from the list below.'; break }
      busy = 0
      if (r.json.capped) { run.capped = true; run.message = r.json.message; break }
      if (run.mailing.done) break
      paintE()
    }
    run.going = false
    if (run.stop && !run.mailing.done) run.message = 'Stopped. Resume it from the list below whenever you like: nobody gets it twice.'
    paintE()
    loadMailInfo()
  }
  const startMailing = () => {
    const f = eState.fields
    const n = countFor(eState.audience)
    sure({
      title: `Send to ${many(n, 'person', 'people')}?`,
      lines: [`"${f.subject}" · ${AUDIENCE_SHORT[eState.audience]}`, `It goes out ${eState.info.batch} at a time while this page stays open, each with their first name and an unsubscribe link. You can stop and carry on later: nobody gets it twice.`, eState.audience === 'all' ? 'This goes to everyone with an account, also those who said no to news: only for notices about the service.' : ''],
      ok: `Send to ${many(n, 'person', 'people')}`,
      plain: true,
      run: async () => {
        const r = await mApi({ action: 'adminMailStart', fields: f, audience: eState.audience })
        if (!r.ok) return r.json.message || 'It could not be started. Try again.'
        setTimeout(() => runMailing(r.json.mailing), 0)
        return ''
      },
    })
  }
  const sendTest = async (b) => {
    b.disabled = true; b.textContent = 'Sending…'
    const r = await mApi({ action: 'adminMailTest', fields: eState.fields, audience: eState.audience })
    eState.note = r.ok ? { ok: true, text: `Test sent to ${r.json.to}` } : { ok: false, text: r.json.message || 'Not sent. Try again.' }
    paintE()
  }
  addEventListener('beforeunload', (e) => { if (eState.run && eState.run.going) { e.preventDefault(); e.returnValue = '' } })
  const progress = () => {
    const run = eState.run
    if (!run) return null
    const m = run.mailing
    const handled = m.sent + m.failed + m.skipped
    const pct = m.total ? Math.round((handled / m.total) * 100) : 100
    const bar = el('div', { className: 'ie-bar', role: 'progressbar', ariaLabel: 'Sent so far' }, [el('i', { style: `width:${pct}%` })])
    bar.setAttribute('aria-valuenow', String(pct))
    return el('div', { className: `ie-run ${m.done ? 'is-done' : run.capped || run.message ? 'is-held' : ''}` }, [
      el('div', { className: 'ie-run-top' }, [
        el('strong', { textContent: m.done ? `Sent: ${m.subject}` : run.going ? `Sending: ${m.subject}` : `Paused: ${m.subject}` }),
        run.going ? button(run.stop ? 'Stopping…' : 'Stop', () => { run.stop = true; paintE() }) : button('Close', () => { eState.run = null; paintE() }, 'io-link'),
      ]),
      bar,
      el('p', { className: 'ic-hint', textContent: `${m.sent} of ${m.total} sent${m.failed ? ` · ${m.failed} failed` : ''}${m.skipped ? ` · ${m.skipped} left out (unsubscribed or gone since)` : ''}` }),
      run.message ? el('p', { className: `ic-said ${run.capped ? 'is-bad' : ''}`, textContent: run.message }) : null,
      run.capped ? button('Resume', () => runMailing(m), 'ia-btn ic-go') : null,
    ])
  }
  const mailRow = (m) => {
    const st = m.done ? (m.ended ? 'Stopped' : 'Sent') : 'Not finished'
    const running = eState.run && eState.run.going && eState.run.mailing.id === m.id
    return el('div', { className: 'ie-row' }, [
      el('span', {}, [el('strong', { textContent: date(m.createdAt) }), el('small', { textContent: m.finishedAt ? `finished ${date(m.finishedAt, true)}` : m.lastAt ? `last sent ${date(m.lastAt, true)}` : 'not sent yet' })]),
      el('span', {}, [el('strong', { textContent: m.subject }), el('small', { textContent: `${reasonName(m.reason)} · ${AUDIENCE_SHORT[m.audience] || m.audience}` })]),
      el('span', {}, [el('strong', { textContent: `${m.sent} / ${m.total}` }), el('small', { textContent: [m.failed ? `${m.failed} failed` : '', m.skipped ? `${m.skipped} left out` : ''].filter(Boolean).join(' · ') || 'sent' })]),
      el('span', { className: `io-pill ${m.done && !m.ended ? 'is-delivered' : ''}`, textContent: running ? 'Sending' : st }),
      el('span', { className: 'ie-row-links' }, [
        !m.done && !running ? button('Resume', () => sure({ title: 'Carry on sending?', lines: [`"${m.subject}": ${m.total - m.sent - m.failed - m.skipped} still to go.`, 'It picks up where it stopped. Those who already have it do not get it again.'], ok: 'Resume', plain: true, run: async () => { setTimeout(() => runMailing(m), 0); return '' } }), 'io-link') : null,
        button('Use again', () => {
          eState.fields = { ...m.fields, pieces: [...(m.fields.pieces || [])] }
          eState.audience = m.audience; eState.touched = true; eState.note = null
          paintE(); preview(); emailScreen.scrollTop = 0
        }, 'io-link'),
        !m.done && !running ? button('Give up the rest', () => sure({ title: 'Give up the rest?', lines: [`"${m.subject}": ${m.sent} of ${m.total} sent.`, 'Nobody else gets it. It stays in this list, marked Stopped.'], ok: 'Give up the rest', run: async () => { const r = await mApi({ action: 'adminMailEnd', id: m.id }); if (!r.ok) return r.json.message || 'Try again.'; loadMailInfo(); return '' } }), 'io-link io-link-danger') : null,
      ]),
    ])
  }
  const step = (n, title, kids) => el('div', { className: 'ie-step' }, [el('div', { className: 'ie-step-n', textContent: String(n) }), el('div', { className: 'ie-step-body' }, [el('h3', { textContent: title }), ...kids])])
  const ebody = el('div', { className: 'ie-body' })
  const erefresh = button('Refresh', () => loadMailInfo())
  const emailScreen = el('main', { className: 'ia-orders is-emails' }, [
    el('div', { className: 'ia-home-inner' }, [
      el('div', { className: 'io-top' }, [
        el('div', {}, [
          el('div', { className: 'ia-kicker', textContent: 'Orders' }),
          el('h1', { textContent: 'Emails' }),
          el('p', { className: 'ia-lead', textContent: 'Write to your customers: news, a discount, new prints, a convention. Ready-made emails in your own voice to start from, a preview of exactly what they get, then send.' }),
        ]),
        el('div', { className: 'io-actions' }, [erefresh]),
      ]),
      ebody,
    ]),
  ])
  const paintE = () => {
    erefresh.textContent = eState.loading ? 'Loading…' : 'Refresh'
    const focused = document.activeElement && emailScreen.contains(document.activeElement) ? document.activeElement.dataset.draft : ''
    const caret = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null
    if (eState.problem) { ebody.replaceChildren(el('div', { className: 'io-empty' }, [el('strong', { textContent: 'Emails are not available' }), el('span', { textContent: eState.problem })])); return }
    const info = eState.info
    if (!info) { ebody.replaceChildren(el('p', { className: 'io-summary', textContent: 'Loading…' })); return }
    const f = eState.fields
    const n = countFor(eState.audience)
    // 1. who
    const seg = el('div', { className: 'ie-seg', role: 'radiogroup', ariaLabel: 'Who it goes to' }, info.audiences.map((a) => {
      const b = el('button', { type: 'button', role: 'radio', ariaChecked: String(eState.audience === a.id), className: `ic-stage ${eState.audience === a.id ? 'on' : ''}`, textContent: AUDIENCE_SHORT[a.id] || a.label })
      b.addEventListener('click', () => { eState.audience = a.id; paintE(); preview() })
      return b
    }))
    const who = [seg,
      el('p', { className: 'ie-count' }, [el('b', { textContent: String(n) }), ` ${n === 1 ? 'person' : 'people'} · ${info.audiences.find((a) => a.id === eState.audience).label}`]),
      eState.audience === 'all' ? el('p', { className: 'ie-warn', textContent: 'Only for notices about the service (a change to the shop, to accounts, to how their data is kept). News, offers and new prints should only go to those who agreed to news (Australia\'s Spam Act asks for consent).' }) : null,
      hint('Accounts with a confirmed email only. Test addresses (example.com and the like) are never counted or sent to.')]
    // 2. why
    const reasons = el('select', { className: 'io-select', ariaLabel: 'Reason' }, [el('option', { value: '', textContent: 'Choose a reason…', selected: !f }), ...Object.entries(info.templates).map(([k, t]) => el('option', { value: k, textContent: t.label, selected: Boolean(f && f.reason === k) }))])
    reasons.addEventListener('change', () => pickReason(reasons.value))
    // 3. the words
    const words = f ? [
      el('div', { className: 'ic-pair' }, [efield('Subject', mailInput('subject', { maxLength: 150 })), efield('Small label', mailInput('kicker', { maxLength: 40, placeholder: 'Shop news' }))]),
      efield('Heading', mailInput('title', { maxLength: 120 })),
      efield('The text', mailInput('text', { maxLength: 5000 }, true)),
      hint('Each line is a paragraph. Every email starts with "Hi" and the person\'s first name, and ends with a link to unsubscribe.'),
      el('div', { className: 'ic-pair' }, [efield('Button words', mailInput('buttonLabel', { maxLength: 60, placeholder: 'Leave empty for no button' })), SOCIAL[f.reason] ? null : efield('Button link', mailInput('buttonUrl', { maxLength: 500, placeholder: '/shop or https://…', spellcheck: false }))]),
    ] : []
    // 4. send
    const today = info.today || { sent: 0, cap: 450 }
    const going = Boolean(eState.run && eState.run.going)
    const testBtn = button('Send a test to me', () => sendTest(testBtn))
    testBtn.disabled = !f || !info.testTo || going
    const sendBtn = button(`Send to ${many(n, 'person', 'people')}`, startMailing, 'ia-btn ic-go')
    sendBtn.disabled = !f || !n || going || today.sent >= today.cap
    const frame = el('iframe', { className: 'ie-frame', title: 'Preview of the email', srcdoc: eState.html || '' })
    frame.setAttribute('sandbox', '') // the email's links stay put
    ebody.replaceChildren(
      el('div', { className: 'ie-grid' }, [
        el('section', { className: 'ie-form' }, [
          step(1, 'Who it goes to', who),
          step(2, 'Why you are writing', [reasons, ...(f ? extras() : [hint('Each reason starts you off with a ready-made email in your own words. You can change all of it.')])]),
          f ? step(3, 'The email', words) : null,
          f ? step(4, 'Check and send', [
            el('div', { className: 'ie-line' }, [testBtn, sendBtn]),
            hint(`${info.testTo ? `The test goes to ${info.testTo}${info.testIsFake ? ' (a test address: it is only written in the server\'s log)' : ''}.` : 'Add your email under Site → Brand & contact to get tests.'} Sent by mass emails in the last 24 hours: ${today.sent} of ${today.cap} (Gmail allows about 500 a day).`),
            today.sent >= today.cap ? el('p', { className: 'ic-said is-bad', textContent: "Gmail's daily limit is near: carry on tomorrow." }) : null,
            eState.note ? el('p', { className: `ic-said ${eState.note.ok ? '' : 'is-bad'}`, textContent: eState.note.text }) : null,
          ]) : null,
          progress(),
        ]),
        el('aside', { className: 'ie-side' }, [
          el('div', { className: 'ie-side-head' }, [el('span', { textContent: 'Preview' }), f ? el('small', { textContent: 'As "Alex" sees it' }) : null]),
          f ? frame : el('div', { className: 'ie-empty', textContent: 'Choose a reason, and the email shows here as it will arrive.' }),
        ]),
      ]),
      el('h2', { className: 'ie-h2', textContent: 'Sent before' }),
      info.mailings.length ? el('div', { className: 'ie-list' }, info.mailings.map(mailRow)) : el('div', { className: 'io-empty' }, [el('strong', { textContent: 'Nothing sent yet' }), el('span', { textContent: 'Your mass emails show here, with how far each got.' })]),
    )
    if (focused) {
      const again = ebody.querySelector(`[data-draft="${focused}"]`)
      if (again) { again.focus(); try { if (caret && caret[0] != null) again.setSelectionRange(caret[0], caret[1]) } catch { /* not a text field */ } }
    }
  }

  // ======================================================================
  // ---------- their places in the navigation (under Orders), with the number of unread messages
  const count = el('span', { className: 'io-count', hidden: true })
  const comLink = el('a', { href: CROUTE, className: 'io-nav' }, [svg(CHAT), el('span', { textContent: 'Commissions' }), count])
  const mailLink = el('a', { href: EROUTE, className: 'io-nav' }, [svg(MAIL), el('span', { textContent: 'Emails' })])
  const badge = () => { const n = cUnread(); count.hidden = !n; count.textContent = n > 99 ? '99+' : String(n) }
  const sync = () => {
    const at = location.hash.startsWith(CROUTE) ? 'commissions' : location.hash.startsWith(EROUTE) ? 'emails' : ''
    if (at) document.documentElement.dataset.iaOrders = at
    else if (['commissions', 'emails'].includes(document.documentElement.dataset.iaOrders)) delete document.documentElement.dataset.iaOrders
    comLink.classList.toggle('on', at === 'commissions')
    mailLink.classList.toggle('on', at === 'emails')
    if (at !== 'commissions' && cState.open) { cHush(); cState.open = null; cState.detail = null; paintPanel() }
    if (!at) return
    document.querySelectorAll('.ia-side nav a.on').forEach((a) => a !== comLink && a !== mailLink && a.classList.remove('on'))
    if (at === 'commissions') {
      comScreen.scrollTop = 0
      if (!cState.loaded && !cState.loading) loadCommissions()
      const want = new URLSearchParams(location.hash.split('?')[1] || '').get('c')
      if (want && want !== cState.open) openCommission(want)
      paintC()
    } else {
      emailScreen.scrollTop = 0
      if (!eState.loaded && !eState.loading) loadMailInfo()
      paintE()
    }
  }
  addEventListener('hashchange', () => setTimeout(sync, 0)) // after orders.js has had its turn
  const place = setInterval(() => {
    const nav = document.querySelector('.ia-side nav[aria-label="Orders and customers"]')
    if (!nav) return
    clearInterval(place)
    nav.append(comLink, mailLink)
    document.body.append(comScreen, emailScreen, shade, panel)
    // the Overview: two more tiles beside Orders, Customers and Discounts
    const tiles = [...document.querySelectorAll('.ia-home-inner .ia-group')].find((g) => /Orders, customers/.test(g.textContent))
    const holder = tiles && tiles.querySelector('.ia-tiles')
    if (holder) {
      const tile = (icon, title, text, href, action) => el('div', { className: 'ia-tile' }, [el('div', { className: 'ia-tile-icon' }, [svg(icon)]), el('h3', { textContent: title }), el('p', { textContent: text }), el('div', { className: 'ia-tile-actions' }, [el('a', { className: 'ia-btn', href, textContent: action })])])
      holder.append(
        tile(CHAT, 'Commissions', 'Requests from the Commissions page: talk them over, send a quote, move the piece through its stages and send the finished file.', CROUTE, 'Open commissions'),
        tile(MAIL, 'Emails', 'Write to your customers at once: news, a discount, new prints, a convention. Preview it, test it, send.', EROUTE, 'Open emails'),
      )
    }
    sync()
    // a quiet first look, so the number beside Commissions is right from the start
    const ready = setInterval(() => {
      if (!document.querySelector('[class*="AppHeader"], [class*="ToolbarContainer"]')) return
      clearInterval(ready)
      if (!cState.loaded && !cState.loading) loadCommissions(true)
    }, 500)
  }, 250)
  setTimeout(() => clearInterval(place), 30000)
  // ---------- "Search everything" (shell.js): commissions that match, by number, name, email or piece
  ;(window.iaFinders = window.iaFinders || []).push(async (q) => {
    const s = q.toLowerCase()
    if (!cState.loaded) await loadCommissions(true)
    for (let i = 0; i < 100 && cState.loading; i++) await new Promise((ok) => setTimeout(ok, 150))
    const found = cState.list.filter((c) => [c.number, c.name, c.email, c.title, c.kind].join(' ').toLowerCase().includes(s))
    return [{
      name: 'Commissions', total: found.length,
      rows: found.slice(0, 6).map((c) => ({ kind: 'Commission', title: [c.number, c.name || c.email].filter(Boolean).join(' · '), sub: [c.title, cName[c.status] || c.status, c.price != null ? money(c.price, c.currency) : '', date(c.createdAt)].filter(Boolean).join(' · '), go: () => { location.hash = `${CROUTE}?c=${encodeURIComponent(c.id)}` } })),
      all: () => { cState.q = q; csearch.value = q; location.hash = CROUTE },
    }]
  })
})()
