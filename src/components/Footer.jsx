import { useState } from 'react'
import { Link } from 'react-router-dom'
import { brand, footer, nav, social } from '../data/site'
import SocialIcon from './SocialIcon'
import Wordmark from './Wordmark'

export default function Footer() {
  const [year] = useState(() => new Date().getFullYear()) // read on every visit, so the © line rolls over by itself on 1 January
  return (
    <footer className="footer">
      {footer.line && <div className="footer-shout" aria-hidden="true"><span>{footer.line}</span></div>}
      <div className="container">
        <div className="footer-grid">
          <div>
            <Wordmark className="lg" />
            <p className="dim">{brand.blurb}</p>
            {brand.email && <a className="footer-mail" href={`mailto:${brand.email}`}>{brand.email}</a>}
          </div>
          <div>
            <div className="label">Pages</div>
            <ul className="footer-list">
              {nav.map((n) => <li key={n.to}><Link to={n.to}>{n.label}</Link></li>)}
            </ul>
          </div>
          {social.length > 0 && (
            <div>
              <div className="label">Follow</div>
              <ul className="footer-social">
                {social.map((s) => (
                  <li key={s.label + s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      <SocialIcon name={s.label} />
                      <span><strong>{s.label}</strong>{s.handle && <small>{s.handle}</small>}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="footer-fine">
          <span>© {year} {brand.artist || brand.name}. Characters shown in fan art belong to their owners.</span>
          {brand.location && <span>{brand.location}</span>}
        </div>
      </div>
    </footer>
  )
}
