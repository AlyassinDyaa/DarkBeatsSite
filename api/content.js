import { configured, goodPass, repo } from './_session.js'

/* What has an admin saved since this copy of the site was built?
   A save is a commit, and the site only shows it once it has rebuilt (about a minute). So that
   the admin can check their work straight away, the site asks this function, with the admin's
   login pass, for the content files and pictures that are newer than the build it is running,
   and lays them over what it has (src/data/site.js, showLatest). Visitors never call this: they
   get the rebuilt site a minute later. When nothing is newer the answer is just { fresh: false }. */
const github = (path) => fetch(`https://api.github.com${path}`, {
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'darkbeats-admin' },
})
const KINDS = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' }
const PICTURE_ROOM = 3.2 * 1024 * 1024 // the answer itself may only be about 4 MB

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const nothing = (status = 200) => res.status(status).json({ fresh: false })
  if (!configured()) return nothing(500)
  if (!goodPass(String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, ''))) return nothing(401)
  const builtFrom = process.env.VERCEL_GIT_COMMIT_SHA
  const branch = process.env.VERCEL_GIT_COMMIT_REF || 'main'
  if (!builtFrom) return nothing()
  try {
    const compared = await github(`/repos/${repo()}/compare/${builtFrom}...${encodeURIComponent(branch)}`)
    if (!compared.ok) return nothing()
    const { ahead_by: ahead, files = [] } = await compared.json()
    if (!ahead) return nothing()

    const blob = async (sha) => {
      const answer = await github(`/repos/${repo()}/git/blobs/${sha}`)
      return answer.ok ? String((await answer.json()).content || '').replace(/\s/g, '') : null
    }
    const content = {}
    const pictures = []
    await Promise.all(files.map(async (f) => {
      const isContent = /^content\/.+\.json$/.test(f.filename)
      if (f.status === 'renamed' && /^content\/.+\.json$/.test(f.previous_filename || '')) content[f.previous_filename] = null
      if (!isContent) { if (/^public\/uploads\/[^/]+$/.test(f.filename) && f.status !== 'removed') pictures.push(f); return }
      if (f.status === 'removed') { content[f.filename] = null; return }
      const data = await blob(f.sha)
      try { if (data != null) content[f.filename] = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) } catch { /* a half-written file: leave the built-in one */ }
    }))
    // new pictures are not on the site until it has rebuilt, so they travel inside the answer
    const media = {}
    let room = PICTURE_ROOM
    for (const f of pictures) {
      if ((f.size || 0) * 1.34 > room) continue
      const data = await blob(f.sha)
      if (data == null || data.length > room) continue
      room -= data.length
      media[`/${f.filename.replace(/^public\//, '')}`] = `data:${KINDS[f.filename.split('.').pop().toLowerCase()] || 'application/octet-stream'};base64,${data}`
    }
    res.status(200).json({ fresh: Object.keys(content).length + Object.keys(media).length > 0, content, media })
  } catch {
    nothing()
  }
}
