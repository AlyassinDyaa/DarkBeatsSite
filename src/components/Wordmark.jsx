import { brand, nameParts } from '../data/site'

/* The name as a mark: the second half of a two-part name takes the brand colour. */
export default function Wordmark({ className = '' }) {
  const [a, b] = nameParts(brand.name)
  return <span className={`wordmark ${className}`}>{a}{b && <b>{b}</b>}</span>
}
