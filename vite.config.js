import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'

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
    for (const [k, v] of Object.entries(keys)) if (/^(STRIPE_|PAYPAL_|MONGODB_|RESEND_|MAIL_|SMTP_|CONTACT_TO$|ORDER_EMAIL_TO$|SITE_URL$)/.test(k) && v && !process.env[k]) process.env[k] = v
    // These functions run on Vercel. While developing, the same files answer here, so the Buy
    // button and the accounts behave as they will live (without their keys they say so). The
    // Stripe webhook reads its message as it arrived, so its body is left alone.
    // The admin's Orders and Discounts screens read the Stripe sandbox (and the test database) too.
    // On Vercel they need the admin's login; this copy has no login (the admin here saves straight
    // to the files on this computer), so they answer only to this computer, with a pass made here.
    const ADMIN = ['orders', 'discounts', 'members']
    if (!process.env.ADMIN_PASSCODE) process.env.ADMIN_PASSCODE = randomBytes(24).toString('hex')
    if (!process.env.GITHUB_TOKEN) process.env.GITHUB_TOKEN = randomBytes(24).toString('hex')
    for (const name of ['checkout', 'account', 'stripe-webhook', 'contact', ...ADMIN]) {
      server.middlewares.use(`/api/${name}`, async (req, res) => {
        res.status = (code) => { res.statusCode = code; return res }
        res.json = (body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res }
        if (ADMIN.includes(name)) {
          if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(String(req.socket.remoteAddress || ''))) return res.status(403).json({ message: 'Only from this computer.' })
          const { newPass } = await import(`${pathToFileURL(resolve('api/_session.js')).href}`)
          req.headers.authorization = `Bearer ${newPass()}`
        }
        if (name !== 'stripe-webhook') {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          try { req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { req.body = {} }
        }
        try {
          const { default: handler } = await import(`${pathToFileURL(resolve(`api/${name}.js`)).href}?t=${Date.now()}`)
          await handler(req, res)
        } catch (e) { res.status(500).json({ message: `The ${name} function failed: ${e.message}` }) }
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

/* The artwork, as the built site sends it: never the full-size file. Every uploaded picture is
   brought down to ART_MAX pixels on its long side (sharp on any screen, too small for a good
   print: A3 wants about 3500), and the pictures of the Shop, the Work page and the before-and-afters
   carry the artist's logo inside the picture itself: clearly in a corner, and faintly and large in
   the middle, so cropping the corner off does not remove it. The files in public/uploads (what the
   admin uploads, and what this computer's dev server shows) stay as they are: only the copies in
   dist, which are what visitors get, are changed. The logo and the site icon are left alone. */
const ART_MAX = 1400
const ART_FOLDERS = ['work', 'gallery-sections', 'redraws'] // whose pictures get the watermark
const readBrand = () => { try { return JSON.parse(readFileSync(resolve('content/site/brand.json'), 'utf8')) } catch { return {} } }
// the watermark can be switched off in the admin (Site → Show / hide → Artwork); it is on unless switched off
const watermarkOn = () => { try { return (JSON.parse(readFileSync(resolve('content/site/visibility.json'), 'utf8')).artwork || {}).watermark !== false } catch { return true } }
// every /uploads picture named in the Shop, Work, before-and-after and home-wall content (none while the watermark is off)
const artPictures = () => {
  const art = new Set()
  if (!watermarkOn()) return art
  for (const folder of ART_FOLDERS) {
    const at = resolve('content', folder)
    if (!existsSync(at)) continue
    for (const f of readdirSync(at)) {
      if (!f.endsWith('.json')) continue
      for (const m of readFileSync(resolve(at, f), 'utf8').matchAll(/"(\/uploads\/[^"]+)"/g)) art.add(m[1])
    }
  }
  // the home page's poster wall: pictures put on it directly (not from a piece) are artwork too
  try {
    const home = JSON.parse(readFileSync(resolve('content/pages/home.json'), 'utf8'))
    for (const w of Array.isArray(home.wall) ? home.wall : []) if (w && typeof w.picture === 'string' && w.picture.startsWith('/uploads/')) art.add(w.picture)
  } catch { /* no home page content */ }
  return art
}
/* One picture as visitors get it: at most ART_MAX pixels on its long side, and for the artwork the
   logo inside the picture, clearly in a corner and faintly and large in the middle (cropping the
   corner off does not remove it). Answers null when the picture needs nothing. */
const artCopy = async (sharp, source, url, art, brand) => {
  const keep = new Set([brand.logo, brand.icon].filter(Boolean)) // the logo and the icon stay as uploaded
  if (keep.has(url)) return null
  const logoFile = brand.logo && existsSync(resolve(`public${brand.logo}`)) ? resolve(`public${brand.logo}`) : null
  const meta = await sharp(source).metadata()
  const big = Math.max(meta.width || 0, meta.height || 0) > ART_MAX
  const isArt = art.has(url) && Boolean(logoFile)
  if (!big && !isArt) return null
  let img = sharp(source)
  let w = meta.width, h = meta.height
  if (big) {
    img = img.resize({ width: ART_MAX, height: ART_MAX, fit: 'inside', withoutEnlargement: true })
    const r = Math.min(ART_MAX / w, ART_MAX / h); w = Math.round(w * r); h = Math.round(h * r)
  }
  if (isArt) {
    // the logo at a width, in white at a strength, with a soft dark shadow so it reads on light art too
    const mark = async (width, strength) => {
      const logo = await sharp(logoFile).resize({ width: Math.max(16, Math.round(width)) }).ensureAlpha().png().toBuffer()
      const lm = await sharp(logo).metadata()
      const fade = (buf, a) => sharp(buf).ensureAlpha().linear([1, 1, 1, a], [0, 0, 0, 0]).png().toBuffer()
      const shadow = await sharp(await sharp(logo).ensureAlpha().linear([0, 0, 0, 1], [0, 0, 0, 0]).png().toBuffer()).blur(Math.max(1, width / 60)).png().toBuffer()
      const pad = Math.ceil(width / 30)
      return sharp({ create: { width: lm.width + pad * 2, height: lm.height + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
        { input: await fade(shadow, strength * 0.7), left: pad + Math.round(pad / 3), top: pad + Math.round(pad / 3) },
        { input: await fade(logo, strength), left: pad, top: pad },
      ]).png().toBuffer()
    }
    const short = Math.min(w, h)
    const corner = await mark(short * 0.17, 0.62)
    const middle = await mark(short * 0.62, 0.11)
    const c = await sharp(corner).metadata(), m = await sharp(middle).metadata()
    img = sharp(await img.toBuffer()).composite([
      { input: middle, left: Math.round((w - m.width) / 2), top: Math.round((h - m.height) / 2) },
      { input: corner, left: Math.max(0, Math.round(w - c.width - short * 0.025)), top: Math.max(0, Math.round(h - c.height - short * 0.025)) },
    ])
  }
  const ext = url.split('.').pop().toLowerCase()
  const out = ext === 'png' ? img.png({ compressionLevel: 9 }) : ext === 'webp' ? img.webp({ quality: 82 }) : img.jpeg({ quality: 82, mozjpeg: true })
  return { buffer: await out.toBuffer(), shrunk: big, marked: isArt }
}

/* The artwork as visitors get it: never the full-size file. When the site is built, every uploaded
   picture in dist is replaced by its copy (artCopy). The files in public/uploads (what the admin
   uploads) stay as they are. On this computer the dev server hands out the same copies, so what
   is seen here is what visitors will see. */
const protectArt = () => ({
  name: 'protect-art',
  configureServer(server) {
    const made = new Map() // url -> { at, buffer }: made once per change of the file
    server.middlewares.use(async (req, res, next) => {
      const url = decodeURIComponent((req.url || '').split('?')[0])
      if (!/^\/uploads\/[^/]+\.(webp|png|jpe?g)$/i.test(url)) return next()
      const file = resolve(`public${url}`)
      if (!existsSync(file)) return next()
      try {
        const { default: sharp } = await import('sharp')
        sharp.cache(false)
        const at = statSync(file).mtimeMs
        const key = `${at}:${watermarkOn()}` // made again when the file changes, or the watermark is switched
        let hit = made.get(url)
        if (!hit || hit.at !== key) {
          const copy = await artCopy(sharp, readFileSync(file), url, artPictures(), readBrand())
          hit = { at: key, buffer: copy && copy.buffer }
          made.set(url, hit)
        }
        if (!hit.buffer) return next()
        res.setHeader('Content-Type', `image/${/\.jpe?g$/i.test(url) ? 'jpeg' : url.split('.').pop().toLowerCase()}`)
        res.setHeader('Cache-Control', 'no-cache')
        res.end(hit.buffer)
      } catch { next() }
    })
  },
  async closeBundle() {
    if (!building) return
    const dir = resolve('dist/uploads')
    if (!existsSync(dir)) return
    const { default: sharp } = await import('sharp')
    sharp.cache(false)
    const art = artPictures(), brand = readBrand()
    let shrunk = 0, marked = 0
    for (const name of readdirSync(dir)) {
      if (!/\.(webp|png|jpe?g)$/i.test(name)) continue
      const file = resolve(dir, name)
      const copy = await artCopy(sharp, readFileSync(file), `/uploads/${name}`, art, brand) // read into memory: Windows keeps an opened file locked
      if (!copy) continue
      writeFileSync(file, copy.buffer)
      if (copy.shrunk) shrunk++
      if (copy.marked) marked++
    }
    console.log(`  artwork: ${shrunk} pictures brought down to ${ART_MAX}px, ${marked} marked with the logo`)
  },
})

export default defineConfig({
  // Set VITE_BASE=/repo-name/ when deploying under a sub-path (GitHub project pages).
  base: process.env.VITE_BASE || '/',
  plugins: [react(), spaFallback(), brandIcon(), protectArt(), adminBundle()],
  // PORT lets a preview tool pick a free port; 5174 keeps clear of other sites' dev servers.
  server: { port: Number(process.env.PORT) || 5174 },
})
