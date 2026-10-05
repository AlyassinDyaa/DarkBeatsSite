/* Starting the admin, and logging in.

   On this computer the panel saves through a local helper and needs no login, so it goes
   straight in. On Netlify the login is Netlify's own. On Vercel the build leaves a backend.json
   beside this file, and the login is a passcode, asked for on this page itself:

     1. the passcode goes to the site's own /api/auth, which answers with a pass good for a week;
     2. the pass is put where Decap keeps its login, so Decap starts already logged in and saves
        through /api/gh (which holds the GitHub token; nobody logging in needs a GitHub account);
     3. on a later visit the kept pass is checked first, and the passcode is only asked for again
        once it has run out.

   Decap's own login screen, which would open the passcode in a second window, is therefore
   never shown in the ordinary course of things. */
(() => {
  const KEY = 'decap-cms-user' // where Decap keeps its login
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props)
    kids.forEach((k) => k != null && n.append(k))
    return n
  }
  const kept = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
  const forget = () => { try { localStorage.removeItem(KEY) } catch { /* nothing kept */ } }
  const keep = (token) => { try { localStorage.setItem(KEY, JSON.stringify({ token, backendName: 'github' })); return true } catch { return false } }
  const stillGood = (token) => fetch('/api/gh/user', { headers: { Authorization: `token ${token}` }, cache: 'no-store' }).then((r) => r.ok, () => false)

  // ---- the login page
  const ask = () => new Promise((done) => {
    const passcode = el('input', { type: 'password', name: 'passcode', id: 'dl-passcode', autocomplete: 'current-password', required: true })
    const show = el('button', { type: 'button', className: 'dl-show', textContent: 'Show', ariaLabel: 'Show the passcode' })
    show.setAttribute('aria-pressed', 'false')
    show.addEventListener('click', () => {
      const hidden = passcode.type === 'password'
      passcode.type = hidden ? 'text' : 'password'
      show.textContent = hidden ? 'Hide' : 'Show'
      show.setAttribute('aria-pressed', String(hidden))
      passcode.focus()
    })
    const note = el('p', { className: 'dl-note', role: 'status' })
    const submit = el('button', { type: 'submit', className: 'dl-submit' }, [el('span', { textContent: 'Log in' }), el('i', { textContent: '→', ariaHidden: 'true' })])
    const form = el('form', { className: 'dl-box', noValidate: true }, [
      el('img', { className: 'dl-logo', src: '../favicon.png', alt: '', width: 72, height: 72 }),
      el('h1', { className: 'dl-name' }, ['Dark', el('b', { textContent: 'Beats' })]),
      el('div', { className: 'dl-kicker', textContent: 'Admin' }),
      el('label', { className: 'dl-label', htmlFor: 'dl-passcode', textContent: 'Passcode' }),
      el('div', { className: 'dl-field' }, [passcode, show]),
      note,
      submit,
      el('a', { className: 'dl-back', href: '../', textContent: '← Back to the site' }),
    ])
    const page = el('main', { className: 'dl' }, [form])
    document.body.append(page)
    passcode.focus()

    const say = (text, bad) => { note.textContent = text; note.classList.toggle('bad', Boolean(bad)) }
    let busy = false
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (busy) return
      if (!passcode.value) { say('Type the passcode first.', true); return passcode.focus() }
      busy = true
      submit.disabled = true
      say('Checking…')
      try {
        const answer = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ passcode: passcode.value }) })
        const said = await answer.json().catch(() => ({}))
        if (answer.ok && said.token) {
          if (!keep(said.token)) { say('This browser will not keep a login (storage is switched off for this site).', true) } else { page.remove(); return done() }
        } else if (answer.status === 401) {
          say('That passcode is not right. Try again.', true)
          passcode.select()
        } else {
          say(said.message || `The login did not answer (error ${answer.status}). Try again in a moment.`, true)
        }
      } catch {
        say('Could not reach the site. Check the connection and try again.', true)
      }
      busy = false
      submit.disabled = false
    })
  })

  // ---- starting Decap
  const begin = async () => {
    const backend = await fetch('backend.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) // no such file off Vercel
    if (!(backend && backend.name)) {
      window.CMS.init()
      // On this computer Decap's login is a single button with nothing to type: press it for the admin.
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        // (pressed again every half second until the panel is there: a press that comes before
        // Decap has finished starting is ignored)
        let tries = 0
        const enter = setInterval(() => {
          if (document.querySelector('[class*="AppHeader"]') || ++tries > 40) return clearInterval(enter)
          const button = [...document.querySelectorAll('button')].find((b) => /^\s*log ?in\s*$/i.test(b.textContent))
          if (button) button.click()
        }, 500)
      }
      return
    }
    const pass = kept()
    if (!(pass && pass.token && await stillGood(pass.token))) { forget(); await ask() }
    window.CMS.init({ config: { backend: { ...backend, base_url: location.origin, auth_endpoint: 'api/auth', api_root: `${location.origin}/api/gh` }, publish_mode: 'simple' } })
  }
  begin()
})()
