/* Line icons for the social links, picked by the network name typed in the admin.
   Unknown networks get a link icon. */
const ICONS = [
  [/instagram/, 'M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3z M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z M17.2 6.8h.01'],
  [/threads/, 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M15.5 8.5v5c0 3 5 2.6 5-1.5a8.500 8.500 0 1 0-3.400 6.800'],
  [/tiktok/, 'M14 3v11.2a3.6 3.6 0 1 1-3.6-3.6 M14 3c.3 2.7 2.1 4.6 5 4.9'],
  [/^x$|twitter/, 'M5 4l14 16 M19 4L5 20'],
  [/facebook/, 'M14.5 21v-8h2.8l.5-3.4h-3.3V7.7c0-1 .5-1.7 1.8-1.7h1.7V3.1C17.5 3 16.6 3 15.7 3 13 3 11.3 4.6 11.3 7.3v2.3H8.5V13h2.8v8'],
  [/youtube/, 'M4.5 6.5h15A1.5 1.5 0 0 1 21 8v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5z M10.2 9.3v5.4l4.6-2.7z'],
  [/artstation/, 'M3 16.5l2.2 3.8h11.6 M9.3 4h3.4L21 18.3l-1.9 2 M3 16.5L9.3 4 M7 16.5h9.8L11 6.8'],
]
const LINK = 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'

export default function SocialIcon({ name = '' }) {
  const key = name.trim().toLowerCase()
  const d = (ICONS.find(([test]) => test.test(key)) || [null, LINK])[1]
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
