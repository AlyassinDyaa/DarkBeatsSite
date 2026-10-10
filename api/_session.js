import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/* Shared by the two admin functions (a leading underscore keeps Vercel from serving this file).
   The admin logs in with a passcode; in return the browser gets a signed pass that is good for
   a week. The pass is signed with a key made from the passcode and the GitHub token, so changing
   either one in the Vercel settings logs everybody out. */
const DAYS = 7
const key = () => createHash('sha256').update(`${process.env.ADMIN_PASSCODE}|${process.env.GITHUB_TOKEN}`).digest()
const mark = (text) => createHmac('sha256', key()).update(text).digest('hex')

export const configured = () => Boolean(process.env.ADMIN_PASSCODE && process.env.GITHUB_TOKEN)

// compare without giving away, through timing, how much of a guess was right
export const same = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest())

export const newPass = () => {
  const until = String(Date.now() + DAYS * 24 * 60 * 60 * 1000)
  return `ia.${until}.${mark(until)}`
}

export const goodPass = (pass) => {
  const [tag, until, sig] = String(pass || '').split('.')
  return tag === 'ia' && /^\d+$/.test(until || '') && Boolean(sig) && same(sig, mark(until)) && Number(until) > Date.now()
}

// the one repository the admin may touch: the one this site was deployed from
export const repo = () => (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
  ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
  : 'AlyassinDyaa/DarkBeatsSite')

/* An admin request: the admin's pass (as above), or, only on this computer while developing (the
   admin here has no login: vite.config.js), a request from this computer itself. Never on Vercel. */
export const adminOk = (req) => {
  const pass = String((req.headers && req.headers.authorization) || '').replace(/^(token|bearer)\s+/i, '')
  if (configured() && goodPass(pass)) return true
  return !process.env.VERCEL && /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(String((req.socket && req.socket.remoteAddress) || ''))
}
