import { useId, useMemo, useState } from 'react'

/* A phone number: the country (its dialling code) from a list, and the number itself, digits only,
   no longer than an international number can be (15 digits with the country's code). The value is
   kept as "+61 412345678", the way the courier and the admin read it; empty when no number is
   typed. The country starts as the visitor's own (from the browser's language), else Australia. */
const CODES = 'AF93 AL355 DZ213 AD376 AO244 AG1 AR54 AM374 AW297 AU61 AT43 AZ994 BS1 BH973 BD880 BB1 BY375 BE32 BZ501 BJ229 BM1 BT975 BO591 BA387 BW267 BR55 BN673 BG359 BF226 BI257 KH855 CM237 CA1 CV238 KY1 CF236 TD235 CL56 CN86 CO57 KM269 CG242 CD243 CR506 CI225 HR385 CU53 CW599 CY357 CZ420 DK45 DJ253 DM1 DO1 EC593 EG20 SV503 GQ240 ER291 EE372 SZ268 ET251 FO298 FJ679 FI358 FR33 GF594 PF689 GA241 GM220 GE995 DE49 GH233 GI350 GR30 GL299 GD1 GP590 GU1 GT502 GG44 GN224 GW245 GY592 HT509 HN504 HK852 HU36 IS354 IN91 ID62 IR98 IQ964 IE353 IM44 IL972 IT39 JM1 JP81 JE44 JO962 KZ7 KE254 KI686 XK383 KW965 KG996 LA856 LV371 LB961 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MQ596 MR222 MU230 MX52 FM691 MD373 MC377 MN976 ME382 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NC687 NZ64 NI505 NE227 NG234 KP850 MK389 NO47 OM968 PK92 PW680 PS970 PA507 PG675 PY595 PE51 PH63 PL48 PT351 PR1 QA974 RE262 RO40 RU7 RW250 KN1 LC1 VC1 WS685 SM378 ST239 SA966 SN221 RS381 SC248 SL232 SG65 SK421 SI386 SB677 SO252 ZA27 KR82 SS211 ES34 LK94 SD249 SR597 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 TL670 TG228 TO676 TT1 TN216 TR90 TM993 TV688 UG256 UA380 AE971 GB44 US1 UY598 UZ998 VU678 VA39 VE58 VN84 VI1 YE967 ZM260 ZW263'
  .split(' ').map((x) => ({ iso: x.slice(0, 2), dial: x.slice(2) }))
// where a code is shared, the country the code is taken to be when a saved number is read back
const MAIN = { 1: 'US', 7: 'RU', 39: 'IT', 44: 'GB', 47: 'NO', 61: 'AU', 262: 'RE', 590: 'GP', 599: 'CW' }
const MAX = 15 // digits in an international number, the country's code included

const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null } })()
const nameOf = (iso) => { try { return (regionNames && regionNames.of(iso)) || iso } catch { return iso } }
// many computers in Australia say US English, so the clock's time zone is asked first
const ZONES = { Australia: 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ', 'Europe/London': 'GB', 'Asia/Singapore': 'SG', 'Asia/Hong_Kong': 'HK' }
const guessCountry = () => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const hit = ZONES[zone] || ZONES[zone.split('/')[0]]
    if (hit) return hit
  } catch { /* no time zone */ }
  try {
    for (const l of navigator.languages || [navigator.language]) {
      const r = String(l || '').split('-')[1]
      if (r && CODES.some((c) => c.iso === r.toUpperCase())) return r.toUpperCase()
    }
  } catch { /* no browser languages */ }
  return 'AU'
}
// "+61 412345678" -> { iso: 'AU', number: '412345678' }
const read = (value, fallback) => {
  const m = String(value || '').trim().match(/^\+(\d{1,4})\s*([\d\s]*)$/)
  if (!m) return { iso: fallback, number: String(value || '').replace(/\D/g, '') }
  const dial = m[1]
  const iso = (CODES.find((c) => c.iso === fallback && c.dial === dial) || CODES.find((c) => c.iso === MAIN[dial]) || CODES.find((c) => c.dial === dial) || {}).iso || fallback
  return { iso, number: m[2].replace(/\D/g, '') }
}

export default function PhoneField({ label = 'Phone (optional)', value, onChange, error }) {
  const id = useId()
  const list = useMemo(() => CODES.map((c) => ({ ...c, name: nameOf(c.iso) })).sort((a, b) => a.name.localeCompare(b.name)), [])
  const [iso, setIso] = useState(() => read(value, guessCountry()).iso)
  const number = read(value, iso).number
  const dial = (list.find((c) => c.iso === iso) || { dial: '61' }).dial
  const room = MAX - dial.length
  const put = (nextIso, nextNumber) => {
    const d = (list.find((c) => c.iso === nextIso) || { dial }).dial
    const digits = String(nextNumber || '').replace(/\D/g, '').replace(/^0+(?=\d{6})/, '').slice(0, MAX - d.length) // a leading trunk 0 is dropped
    onChange(digits ? `+${d} ${digits}` : '')
  }
  return (
    <div className={`field acc-field acc-phone ${error ? 'has-error' : ''} ${number ? 'has-value' : ''}`}>
      <div className="acc-phone-row">
        <span className="acc-phone-country">
          <span className="acc-phone-code" aria-hidden="true">{iso} +{dial}</span>
          <select value={iso} onChange={(e) => { setIso(e.target.value); put(e.target.value, number) }} aria-label="Country code">
            {list.map((c) => <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>)}
          </select>
        </span>
        <span className="acc-phone-number">
          <input id={id} type="tel" inputMode="numeric" autoComplete="tel-national" value={number} placeholder=" " maxLength={room}
            onChange={(e) => put(iso, e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-note` : undefined} />
          <label htmlFor={id}>{label}</label>
          <span className="bar" />
        </span>
      </div>
      {error && <p id={`${id}-note`} className="acc-note is-error">{error}</p>}
    </div>
  )
}
