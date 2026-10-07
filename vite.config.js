import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { createHash } from 'node:crypto'

// Copies index.html to 404.html after build so GitHub Pages serves the SPA on deep links.
const spaFallback = () => ({
  name: 'spa-404',
  closeBundle() {
    try { writeFileSync(resolve('dist/404.html'), readFileSync(resolve('dist/index.html'))) } catch { /* no dist yet */ }
  },
})

// Serves the self-hosted admin panel (Decap CMS) from node_modules in dev,
// and copies its scripts into dist/admin/ on build, so the panel needs no external CDN.
const CMS_DIR = resolve('node_modules/decap-cms/dist')
const cmsFiles = () => readdirSync(CMS_DIR).filter((f) => /^(\d+\.)?decap-cms\.js$/.test(f))
// The admin saves through a small local helper (decap-server). It listens on 8082 here, not on
// its usual 8081, so that it never shares a helper with another site being worked on at the same
// time: a shared helper would save this site's edits into the other site's folder.
const ADMIN_PORT = 8082
// Without the helper the panel only shows a login it cannot complete, so `npm run dev` starts
// the helper too, unless one is already running, and stops it again on the way out.
const startAdminBackend = (server) => {
  const launch = () => {
    const child = spawn(process.execPath, [resolve('node_modules/decap-server/dist/index.js')], { stdio: 'ignore', windowsHide: true, env: { ...process.env, PORT: String(ADMIN_PORT) } })
    child.on('error', (e) => server.config.logger.warn(`admin backend did not start: ${e.message}`))
    const stop = () => { if (!child.killed) child.kill() }
    server.httpServer?.once('close', stop)
    process.once('exit', stop)
    server.config.logger.info(`  admin backend started on port ${ADMIN_PORT}`)
  }
  // Is one answering already? When this dev server has just restarted itself (after an edit to
  // this file) the helper of the server it replaced may still answer for a moment and then go,
  // so a "yes" is asked again shortly afterwards before it is believed.
  const look = (again) => {
    const probe = connect({ port: ADMIN_PORT, host: '127.0.0.1' })
    probe.once('connect', () => { probe.destroy(); if (again) setTimeout(() => look(again - 1), 1500) })
    probe.once('error', launch)
  }
  look(2)
}

/* The admin's lists can show each entry as a card with its picture. Decap only finds a picture
   in a field called "image", and a gallery section or a then-and-now set keeps its pictures
   inside a list, so the admin gets this index instead: entry -> the picture that stands for it.
   Served live while developing, and written beside the admin on build. */
const thumbs = () => {
  const read = (dir) => {
    try {
      return readdirSync(resolve('content', dir)).filter((f) => f.endsWith('.json'))
        .map((f) => ({ slug: f.replace(/\.json$/, ''), data: JSON.parse(readFileSync(resolve('content', dir, f), 'utf8')) }))
    } catch { return [] }
  }
  const work = read('work').sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
  const index = {}
  for (const piece of work) if (piece.data.src) index[`work/${piece.slug}`] = piece.data.src
  for (const section of read('gallery-sections')) {
    const from = section.data.from
    const pulled = from && from !== 'none' ? work.find((p) => p.data.src && (from === 'all' || p.data.category === from))?.data.src : undefined
    const picture = pulled || (section.data.items || []).find((item) => item && item.src)?.src
    if (picture) index[`gallery_sections/${section.slug}`] = picture
  }
  for (const set of read('redraws')) {
    const picture = [...(set.data.stages || [])].reverse().find((stage) => stage && stage.src)?.src
    if (picture) index[`redraws/${set.slug}`] = picture
  }
  return index
}

/* The browser tab icon chosen in the admin (Brand & contact → Browser tab icon) is used on every
   device. The build makes each size a device asks for out of it, in place of the logo's: the tab
   icon, the iPhone and iPad home-screen icon, and the Android and installed-app icons (the web
   manifest). Every link to them carries a version taken from the picture, so a phone or tablet
   that kept the old icon fetches the new one. Without a chosen icon, the logo files in public/
   stay. While developing, the picture itself is used. */
let siteBase = '/'
let building = false
const at = (path) => siteBase.replace(/\/$/, '') + path
const chosenIcon = () => {
  let icon = ''
  try { icon = JSON.parse(readFileSync(resolve('content/site/brand.json'), 'utf8')).icon || '' } catch { /* no brand file: keep the logo */ }
  if (typeof icon !== 'string' || !/^\/uploads\/[^/]+$/.test(icon)) return null
  const file = resolve('public' + icon)
  return existsSync(file) ? { path: icon, file } : null
}
const iconLinks = () => {
  const icon = chosenIcon()
  if (!icon) return null
  if (!building) return { icon: at(icon.path), touch: at(icon.path), manifest: at('/manifest.webmanifest') }
  const v = createHash('sha1').update(readFileSync(icon.file)).digest('hex').slice(0, 10)
  return { icon: at(`/favicon.png?v=${v}`), touch: at(`/apple-touch-icon.png?v=${v}`), manifest: at(`/manifest.webmanifest?v=${v}`), v }
}
const adminIcon = (html) => {
  const links = iconLinks()
  return links ? html.replace('<link rel="icon" type="image/png" href="../favicon.png" />', `<link rel="icon" type="image/png" href="${links.icon}" />
  <link rel="apple-touch-icon" href="${links.touch}" />`) : html
}
const brandIcon = () => ({
  name: 'brand-icon',
  configResolved(config) { siteBase = config.base; building = config.command === 'build' },
  transformIndexHtml(html) {
    const links = iconLinks()
    if (!links) return html
    return html
      .replace('<link rel="icon" type="image/png" href="/favicon.png" />', `<link rel="icon" type="image/png" href="${links.icon}" />`)
      .replace('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />', `<link rel="apple-touch-icon" href="${links.touch}" />`)
      .replace('<link rel="manifest" href="/manifest.webmanifest" />', `<link rel="manifest" href="${links.manifest}" />`)
  },
  async closeBundle() {
    const icon = chosenIcon()
    if (!building || !icon) return
    const { v } = iconLinks()
    const { default: sharp } = await import('sharp')
    const dark = { r: 9, g: 7, b: 13, alpha: 1 }
    const make = (size, out, background) => sharp(icon.file).resize(size, size, { fit: 'contain', background: background || { r: 0, g: 0, b: 0, alpha: 0 } }).flatten(background ? { background } : false).png().toFile(resolve('dist', out))
    // the tab keeps any see-through edges; home screens fill them with the site's dark background
    await Promise.all([make(96, 'favicon.png'), make(180, 'apple-touch-icon.png', dark), make(192, 'icon-192.png', dark), make(512, 'icon-512.png', dark)])
    const manifest = JSON.parse(readFileSync(resolve('dist/manifest.webmanifest'), 'utf8'))
    manifest.icons = (manifest.icons || []).map((i) => ({ ...i, src: `${String(i.src).split('?')[0]}?v=${v}` }))
    writeFileSync(resolve('dist/manifest.webmanifest'), JSON.stringify(manifest, null, 2))
  },
})

const adminBundle = () => ({
  name: 'admin-bundle',
  configureServer(server) {
    startAdminBackend(server)
    // Keys for trying payments, accounts and email on this computer: put them in .env.local (never
    // committed: *.local is in .gitignore). On Vercel they come from the project settings instead.
    const keys = loadEnv('development', process.cwd(), '')
    for (const [k, v] of Object.entries(keys)) if (/^(STRIPE_|PAYPAL_|MONGODB_|RESEND_|MAIL_|SMTP_|SITE_URL$)/.test(k) && v && !process.env[k]) process.env[k] = v
    // These functions run on Vercel. While developing, the same files answer here, so the Buy
    // button and the accounts behave as they will live (without their keys they say so). The
    // Stripe webhook reads its message as it arrived, so its body is left alone.
    for (const name of ['checkout', 'account', 'stripe-webhook']) {
      server.middlewares.use(`/api/${name}`, async (req, res) => {
        if (name !== 'stripe-webhook') {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          try { req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { req.body = {} }
        }
        res.status = (code) => { res.statusCode = code; return res }
        res.json = (body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res }
        try {
          const { default: handler } = await import(`${pathToFileURL(resolve(`api/${name}.js`)).href}?t=${Date.now()}`)
          await handler(req, res)
        } catch (e) { res.status(500).json({ message: `The ${name} function failed: ${e.message}` }) }
      })
    }
    // Orders and discounts live in Stripe and go through the admin's login, which only exists on
    // Vercel: here those screens say where to find them instead.
    for (const path of ['/api/orders', '/api/discounts']) {
      server.middlewares.use(path, (req, res) => {
        res.statusCode = 503
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ setup: true, message: 'Orders and discounts are read from Stripe on the live admin (jbeatsart.vercel.app/admin). This copy on your computer cannot see them.' }))
      })
    }
    server.middlewares.use('/admin', (req, res, next) => {
      const path = (req.originalUrl || '').split('?')[0]
      const name = (req.url || '').split('?')[0].replace(/^\//, '')
      // "/admin" and "/admin/" would otherwise fall through to the site's own router.
      if (path === '/admin') { res.statusCode = 302; res.setHeader('Location', '/admin/'); return res.end() }
      if (name === '') { res.setHeader('Content-Type', 'text/html'); return res.end(adminIcon(readFileSync(resolve('public/admin/index.html'), 'utf8'))) }
      if (name === 'thumbs.json') { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); return res.end(JSON.stringify(thumbs())) }
      if (!name.endsWith('.js') || !existsSync(resolve(CMS_DIR, name))) return next()
      res.setHeader('Content-Type', 'application/javascript')
      res.end(readFileSync(resolve(CMS_DIR, name)))
    })
  },
  closeBundle() {
    try {
      mkdirSync(resolve('dist/admin'), { recursive: true })
      writeFileSync(resolve('dist/admin/index.html'), adminIcon(readFileSync(resolve('dist/admin/index.html'), 'utf8')))
      for (const f of cmsFiles()) copyFileSync(resolve(CMS_DIR, f), resolve('dist/admin', f))
      writeFileSync(resolve('dist/admin/thumbs.json'), JSON.stringify(thumbs()))
      // On Vercel there is no Netlify login, so the admin logs people in with a passcode instead
      // (the functions in /api) and saves to the repository and branch this build came from.
      // The admin page reads this file; where it is missing it keeps the backend in config.yml.
      if (process.env.VERCEL) {
        const repo = process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
          ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
          : 'AlyassinDyaa/DarkBeatsSite'
        writeFileSync(resolve('dist/admin/backend.json'), JSON.stringify({ name: 'github', repo, branch: process.env.VERCEL_GIT_COMMIT_REF || 'main' }))
      }
    } catch (e) { console.warn('admin bundle copy failed', e.message) }
  },
})

export default defineConfig({
  // Set VITE_BASE=/repo-name/ when deploying under a sub-path (GitHub project pages).
  base: process.env.VITE_BASE || '/',
  plugins: [react(), spaFallback(), brandIcon(), adminBundle()],
  // PORT lets a preview tool pick a free port; 5174 keeps clear of other sites' dev servers.
  server: { port: Number(process.env.PORT) || 5174 },
})
