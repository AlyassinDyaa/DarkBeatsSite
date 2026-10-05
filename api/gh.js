import { configured, goodPass, repo } from './_session.js'

/* Admin saving on Vercel. The admin panel thinks it is talking to GitHub; it is talking to this.
   Each request must carry the pass from /api/auth. If it does, the request is passed on to
   GitHub with the site's own token (GITHUB_TOKEN, which never reaches the browser), and only
   for this site's repository. The panel calls /api/gh/<GitHub path>, which vercel.json routes here. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).json({ message: 'ADMIN_PASSCODE and GITHUB_TOKEN are not set in the Vercel project settings.' })
  const pass = String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, '')
  if (!goodPass(pass)) return res.status(401).json({ message: 'Your login has run out. Log out of the admin and log in again.' })

  // Taken from the address as the panel wrote it, so GitHub gets exactly that. Should the host
  // hand over the rewritten address instead, the same path arrives as "path" in the query.
  const [where, ...rest] = req.url.split('?')
  const query = new URLSearchParams(rest.join('?'))
  const pieces = query.getAll('path')
  query.delete('path')
  const rawPath = where.startsWith('/api/gh/') ? where.slice('/api/gh'.length) : `/${pieces.join('/').split('/').map(encodeURIComponent).join('/')}`
  const more = where.startsWith('/api/gh/') ? rest : [query.toString()].filter(Boolean)
  let path = ''
  try { path = decodeURIComponent(rawPath).toLowerCase() } catch { /* not a valid address: refused below */ }
  const home = `/repos/${repo()}`.toLowerCase()
  const allowed = path === '/user' || path === home || path.startsWith(`${home}/`)
  if (!allowed || path.includes('..')) return res.status(403).json({ message: 'The admin can only reach the repository of this site.' })

  const init = {
    method: req.method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: req.headers.accept || 'application/vnd.github+json', 'User-Agent': 'darkbeats-admin' },
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.headers['Content-Type'] = 'application/json'
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  }
  try {
    const answer = await fetch(`https://api.github.com${rawPath}${more.length ? `?${more.join('?')}` : ''}`, init)
    for (const name of ['content-type', 'link', 'etag']) if (answer.headers.get(name)) res.setHeader(name, answer.headers.get(name))
    res.status(answer.status).send(Buffer.from(await answer.arrayBuffer()))
  } catch {
    res.status(502).json({ message: 'Could not reach GitHub.' })
  }
}
