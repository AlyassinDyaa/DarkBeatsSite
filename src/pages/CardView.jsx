import { CollectorCard, designOf, memberNumber } from './Account'

/* One member's collector card on its own, for the admin's "See their card" window (it shows this page
   in a frame): the same 3D card the member sees, in the design they have equipped, and it turns over
   and spins the same way. Everything it shows comes in the address (name, number, year, card, prints). */
export default function CardView() {
  const q = new URLSearchParams(window.location.search)
  const prints = Number(q.get('prints')) || 0
  return (
    <main className="card-view">
      <CollectorCard
        name={q.get('name') || ''}
        since={q.get('since') || new Date().getFullYear()}
        number={memberNumber(Number(q.get('no')) || null)}
        prints={`${prints} ${prints === 1 ? 'print' : 'prints'}`}
        points={Number(q.get('points')) || 0}
        design={designOf(q.get('card') || '')}
      />
    </main>
  )
}
