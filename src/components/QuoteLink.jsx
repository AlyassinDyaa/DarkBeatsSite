import { Link } from 'react-router-dom'
import { quote } from '../data/site'

/* Where a quote button goes, as the admin chose it (Page text → Commissions → The quote button):
   the request card on the Commissions page (with the offer picked), an email to the artist, their
   Instagram, or another address. `tier` is the offer the button is on, if any. */
export function QuoteGo({ tier = '', className, children, onClick, ...rest }) {
  const to = quote.to(tier)
  if (quote.via === 'site') return <Link className={className} to={to} onClick={onClick} {...rest}>{children}</Link>
  return <a className={className} href={to} onClick={onClick} {...(quote.external ? { target: '_blank', rel: 'noreferrer' } : {})} {...rest}>{children}</a>
}
// the sign after its words: on to the card, an email, or away to another site
export const quoteSign = () => (quote.via === 'site' ? '→' : quote.via === 'email' ? '✉' : '↗')

export default function QuoteLink({ className = 'btn', children, onClick, tier = '' }) {
  return <QuoteGo className={className} tier={tier} onClick={onClick}>{children} <span className="arrow">{quoteSign()}</span></QuoteGo>
}
