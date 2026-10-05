import { configured, newPass, same } from './_session.js'

/* Admin login on Vercel: the passcode (ADMIN_PASSCODE in the Vercel project settings) is traded
   here for a pass that is good for a week. The person logging in needs no GitHub account.

   The admin's own login page (public/admin/login.js) posts the passcode as JSON and gets JSON
   back. A plain visit to this address still answers with a small page of its own, in the message
   exchange Decap expects from a login window: that is the way in if Decap ever shows its own
   "Log in" button (for instance when a pass runs out in the middle of a session). */
const shell = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>DarkBeats admin</title>
<link rel="icon" type="image/png" href="/favicon.png"><link rel="stylesheet" href="/admin/login.css">
<main class="dl">${body}</main></html>`

const form = (wrong) => shell(`<form class="dl-box" method="post" autocomplete="off">
  <img class="dl-logo" src="/favicon.png" alt="" width="72" height="72">
  <h1 class="dl-name">Dark<b>Beats</b></h1>
  <div class="dl-kicker">Admin</div>
  <label class="dl-label" for="dl-passcode">Passcode</label>
  <div class="dl-field"><input type="password" name="passcode" id="dl-passcode" required autofocus></div>
  <p class="dl-note${wrong ? ' bad' : ''}">${wrong ? 'That passcode is not right. Try again.' : ''}</p>
  <button class="dl-submit" type="submit"><span>Log in</span><i aria-hidden="true">→</i></button>
</form>`)

const done = (pass) => shell(`<div class="dl-box"><h1 class="dl-name">Logged <b>in</b></h1><p class="dl-note">This window closes by itself.</p></div>
<script>
  (function () {
    var message = 'authorization:github:success:' + ${JSON.stringify(JSON.stringify({ token: pass, provider: 'github' }))}
    function answer(e) {
      if (e.origin !== location.origin) return
      window.removeEventListener('message', answer, false)
      window.opener.postMessage(message, e.origin)
    }
    window.addEventListener('message', answer, false)
    if (window.opener) window.opener.postMessage('authorizing:github', location.origin)
  })()
</script>`)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const json = /application\/json/.test(String(req.headers.accept || ''))
  const notSetUp = 'Add ADMIN_PASSCODE and GITHUB_TOKEN in the Vercel project settings, then redeploy.'
  if (!json) res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (!configured()) return json ? res.status(500).json({ message: `The admin is not set up yet. ${notSetUp}` }) : res.status(500).send(shell(`<div class="dl-box"><h1 class="dl-name">Not set <b>up</b></h1><p class="dl-note">${notSetUp}</p></div>`))
  if (req.method !== 'POST') return json ? res.status(405).json({ message: 'Send the passcode with POST.' }) : res.status(200).send(form(false))
  const typed = (req.body && typeof req.body === 'object' ? req.body.passcode : new URLSearchParams(String(req.body || '')).get('passcode')) || ''
  if (!same(typed, process.env.ADMIN_PASSCODE)) {
    await new Promise((r) => setTimeout(r, 800)) // slows down guessing
    return json ? res.status(401).json({ message: 'That passcode is not right.' }) : res.status(401).send(form(true))
  }
  const pass = newPass()
  return json ? res.status(200).json({ token: pass }) : res.status(200).send(done(pass))
}
