import { useRef, useState } from 'react'

/* Sending the Contact and Commission forms through the site (api/contact.js): no mail app. The
   form carries a field people never see (a bot fills it in) and when it was shown. `state` is
   '' (ready), 'sending', 'sent', or 'failed' with `problem`; `fallback` is true when the site
   cannot send email at all, so the page offers another way to write. */
export function useSendForm(form) {
  const opened = useRef(Date.now())
  const [state, setState] = useState('')
  const [problem, setProblem] = useState('')
  const [fallback, setFallback] = useState(false)
  const send = async (e) => {
    e.preventDefault()
    if (state === 'sending') return
    const data = Object.fromEntries(new FormData(e.target).entries())
    setState('sending'); setProblem(''); setFallback(false)
    try {
      const answer = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, form, opened: opened.current }) })
      const said = await answer.json().catch(() => ({}))
      if (answer.ok && said.ok) { setState('sent'); e.target.reset(); return }
      setProblem(said.message || 'The message could not be sent. Try again in a moment.')
      setFallback(Boolean(said.fallback))
    } catch {
      setProblem('Could not reach the site. Check the connection and try again.')
    }
    setState('failed')
  }
  return { send, state, problem, fallback, again: () => setState('') }
}
