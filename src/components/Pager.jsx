import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import FilterMenu from './FilterMenu'

/* Pages for a long list (the Shop, the Work page). The page is in the address (?page=2), so Back
   and a shared link land on the same page; how many per page is the visitor's choice, kept in this
   browser. A new filter starts again at page 1. */
export const PER_PAGE = [10, 15, 20, 30]
const DEFAULT_PER = 15
const readPer = () => {
  try { const n = Number(localStorage.getItem('jb.perPage')); return PER_PAGE.includes(n) || localStorage.getItem('jb.perPage') === '0' ? n : DEFAULT_PER } catch { return DEFAULT_PER }
}

export function usePaging(total, resetKey) {
  const [params, setParams] = useSearchParams()
  const [per, setPerNow] = useState(readPer) // 0 = all on one page
  const pages = per ? Math.max(1, Math.ceil(total / per)) : 1
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page')) || 1)), pages)
  const go = (n, replace = false) => {
    const next = new URLSearchParams(params)
    if (n <= 1) next.delete('page'); else next.set('page', String(n))
    setParams(next, { replace, preventScrollReset: true })
  }
  // a new filter: back to the first page (in place of this entry, so Back skips it)
  const was = useRef(resetKey)
  useEffect(() => {
    if (was.current === resetKey) return // the same filter (the first load, a link to page 3)
    was.current = resetKey
    if (params.get('page')) go(1, true)
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const setPer = (n) => {
    setPerNow(n)
    try { localStorage.setItem('jb.perPage', String(n)) } catch { /* private window: this visit only */ }
    if (params.get('page')) go(1, true)
  }
  const from = per ? (page - 1) * per : 0
  const to = per ? Math.min(total, from + per) : total
  return { page, pages, per, from, to, total, go, setPer }
}

// the page numbers to show: the first, the last, and the ones either side of this one, with gaps
const numbers = (page, pages) => {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  if (page <= 3) [2, 3, 4].forEach((n) => n <= pages && keep.add(n))
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => n >= 1 && keep.add(n))
  const list = [...keep].sort((a, b) => a - b)
  return list.flatMap((n, i) => (i && n - list[i - 1] > 1 ? ['gap' + n, n] : [n]))
}

/* Under the list: "11–20 of 47", the pages, and how many per page. Going to a page brings the top
   of the list (anchor) back into view. */
export default function Pager({ paging, anchor, noun = ['piece', 'pieces'] }) {
  const { page, pages, per, from, to, total, go, setPer } = paging
  if (total <= PER_PAGE[0]) return null // one short page: nothing to choose
  const to_ = (n) => {
    go(n)
    const el = anchor && anchor.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 110
    if (window.__lenis) window.__lenis.scrollTo(top, { duration: 0.8 })
    else window.scrollTo({ top, behavior: 'smooth' })
  }
  const options = [...PER_PAGE.map((n) => ({ value: n, label: `${n} per page` })), { value: 0, label: 'All on one page' }]
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-count" aria-live="polite">{from + 1}–{to} of {total} {total === 1 ? noun[0] : noun[1]}</span>
      {pages > 1 && (
        <div className="pager-pages">
          <button type="button" className="pager-step" onClick={() => to_(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg><span>Prev</span>
          </button>
          {numbers(page, pages).map((n) => (typeof n === 'string'
            ? <span key={n} className="pager-gap" aria-hidden="true">…</span>
            : <button key={n} type="button" className={`pager-num ${n === page ? 'on' : ''}`} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} onClick={() => n !== page && to_(n)}>{n}</button>))}
          <button type="button" className="pager-step" onClick={() => to_(page + 1)} disabled={page >= pages} aria-label="Next page">
            <span>Next</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" /></svg>
          </button>
        </div>
      )}
      <div className="pager-per">
        <FilterMenu label="Show" value={per} options={options} onChange={setPer} />
      </div>
    </nav>
  )
}
