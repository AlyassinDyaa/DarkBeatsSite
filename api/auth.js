import { configured, newPass, same } from './_session.js'

/* Admin login on Vercel. The admin panel (Decap CMS) opens this address in a small window when
   "Log in" is pressed. It asks for the passcode (ADMIN_PASSCODE in the Vercel project settings)
   and, if it is right, hands the panel a pass for the next week, in the little message exchange
   Decap expects from a login window. The person logging in needs no GitHub account. */
const shell = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>DarkBeats admin</title>
<link rel="icon" type="image/png" href="/favicon.png">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #09070d radial-gradient(60% 50% at 100% 0%, rgba(232, 62, 173, 0.16), transparent 70%); color: #ece8df; font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  form, .note { box-sizing: border-box; width: min(340px, calc(100vw - 40px)); padding: 30px 28px 28px; background: #120e19; border: 1px solid rgba(232, 230, 224, 0.09);  text-align: center; }
  h1 { margin: 0 0 6px; font-family: Impact, 'Arial Narrow Bold', sans-serif; font-weight: 400; font-size: 24px; letter-spacing: 0.03em; text-transform: uppercase; }
  h1 b { color: #f25fb6; font-weight: inherit; }
  p { margin: 0 0 18px; color: rgba(236, 232, 223, 0.6); font-size: 13px; }
  p.bad { color: #ff6b7f; }
  input { box-sizing: border-box; width: 100%; height: 46px; padding: 0 14px; background: #09070d; color: inherit; border: 1px solid rgba(232, 230, 224, 0.16);  font: inherit; }
  input:focus { outline: 0; border-color: #f25fb6; }
  button { width: 100%; height: 46px; margin-top: 12px; border: 0; background: #f25fb6; color: #0a0710; font: inherit; font-weight: 700; cursor: pointer; }
</style>${body}</html>`

const form = (wrong) => shell(`<form method="post" autocomplete="off">
  <h1>Dark<b>Beats</b> admin</h1>
  <p${wrong ? ' class="bad"' : ''}>${wrong ? 'That passcode is not right. Try again.' : 'Enter the admin passcode.'}</p>
  <input type="password" name="passcode" aria-label="Passcode" placeholder="Passcode" required autofocus>
  <button type="submit">Log in</button>
</form>`)

const done = (pass) => shell(`<div class="note"><h1>Logged in</h1><p>This window closes by itself.</p></div>
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).send(shell('<div class="note"><h1>Not set up yet</h1><p>Add ADMIN_PASSCODE and GITHUB_TOKEN in the Vercel project settings, then redeploy.</p></div>'))
  if (req.method !== 'POST') return res.status(200).send(form(false))
  const typed = (req.body && typeof req.body === 'object' ? req.body.passcode : new URLSearchParams(String(req.body || '')).get('passcode')) || ''
  if (!same(typed, process.env.ADMIN_PASSCODE)) {
    await new Promise((r) => setTimeout(r, 800)) // slows down guessing
    return res.status(401).send(form(true))
  }
  res.status(200).send(done(newPass()))
}
