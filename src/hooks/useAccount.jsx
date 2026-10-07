import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { shop } from '../data/site'

/* The customer's account, when the admin has accounts switched on (Shop & payments → Customer
   accounts). Who is logged in is asked of api/account.js once, on arrival; the login itself is an
   HTTP-only cookie the page never sees. `call(action, data)` runs one account action and keeps
   `user` up to date with the answer. If the database is not set up, `on` stays false and the
   site carries on without accounts. */
const Account = createContext({ ready: true, on: false, required: false, user: null, call: async () => ({}), isSaved: () => false, toggleSaved: async () => {} })
export const accountsWanted = () => ['optional', 'required'].includes(shop.accounts)

export function AccountProvider({ children }) {
  const [state, setState] = useState({ ready: !accountsWanted(), enabled: false, user: null })
  useEffect(() => {
    if (!accountsWanted()) return
    let gone = false
    fetch('/api/account', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((s) => { if (!gone) setState({ ready: true, enabled: Boolean(s.enabled), user: s.user || null }) })
      .catch(() => { if (!gone) setState({ ready: true, enabled: false, user: null }) })
    return () => { gone = true }
  }, [])
  const call = useCallback(async (action, data = {}) => {
    const answer = await fetch('/api/account', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) })
    const said = await answer.json().catch(() => ({}))
    if ('user' in said) setState((s) => ({ ...s, user: said.user }))
    if (!answer.ok) {
      const problem = new Error(said.message || 'Something went wrong. Try again in a moment.')
      problem.field = said.field
      throw problem
    }
    return said
  }, [])
  // pieces kept for later: changed at once on the page, then saved to the account
  const userRef = useRef(null)
  useEffect(() => { userRef.current = state.user }, [state.user])
  const toggleSaved = useCallback(async (slug) => {
    const u = userRef.current
    if (!u) return
    const now = Array.isArray(u.saved) ? u.saved : []
    const next = now.includes(slug) ? now.filter((x) => x !== slug) : [slug, ...now]
    setState((s) => (s.user ? { ...s, user: { ...s.user, saved: next } } : s))
    try { await call('saved', { saved: next }) } catch { setState((s) => (s.user ? { ...s, user: { ...s.user, saved: now } } : s)) }
  }, [call])
  const value = useMemo(() => ({
    ready: state.ready,
    on: accountsWanted() && state.enabled,
    required: accountsWanted() && state.enabled && shop.accounts === 'required',
    user: state.user,
    call,
    isSaved: (slug) => Boolean(state.user && Array.isArray(state.user.saved) && state.user.saved.includes(slug)),
    toggleSaved,
  }), [state, call, toggleSaved])
  return <Account.Provider value={value}>{children}</Account.Provider>
}

export const useAccount = () => useContext(Account)
