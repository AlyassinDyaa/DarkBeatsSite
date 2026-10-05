import { Link } from 'react-router-dom'
import { about, brand, events, shows, social, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Poster from '../components/Poster'
import SocialIcon from '../components/SocialIcon'

export default function About() {
  // two pieces lean beside the text: the newest, and the newest of a different colour family
  const first = work[0]
  const second = work.find((p) => p !== first && Math.abs((p.hue ?? 0) - (first?.hue ?? 0)) > 60) || work[1]
  return (
    <Page title="About">
      <header className="page-head container">
        <div className="label accent">{brand.artist || brand.name}</div>
        <h1 className="display h-xl">{about.title}</h1>
      </header>

      <section className="section tight">
        <div className="container about">
          <div className="about-text">
            {about.paragraphs.map((p, i) => <Reveal as="p" key={i} delay={i * 0.08} className={i === 0 ? 'lead' : 'dim'}>{p}</Reveal>)}
            {about.facts.length > 0 && (
              <Reveal as="dl" className="facts" delay={0.15}>
                {about.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
              </Reveal>
            )}
            <Reveal className="about-actions" delay={0.2}>
              {shows('pages', 'commissions') && <Link className="btn" to="/commissions">Commission a piece <span className="arrow">→</span></Link>}
              {shows('pages', 'gallery') && <Link className="btn ghost" to="/work">See the work</Link>}
            </Reveal>
          </div>
          {first && (
            <Reveal className="about-art" delay={0.1} aria-hidden="true">
              <Poster title={first.title} hue={first.hue} src={first.src} seed={0} />
              {second && <Poster title={second.title} hue={second.hue} src={second.src} seed={work.indexOf(second)} />}
            </Reveal>
          )}
        </div>
      </section>

      {(events.length > 0 || social.length > 0) && (
        <section className="section tight">
          <div className="container about-more">
            {events.length > 0 && (
              <div>
                <div className="label accent">In person</div>
                <ul className="events">
                  {events.map((e) => (
                    <li key={e.slug}>
                      <a className="event" href={e.url || undefined} target={e.url ? '_blank' : undefined} rel="noreferrer">
                        <span className="event-when">{e.when}</span>
                        <span className="event-name">{e.name}</span>
                        <span className="event-where">{[e.role, e.place].filter(Boolean).join(' · ')}</span>
                        {e.url && <span className="arrow" aria-hidden="true">↗</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {social.length > 0 && (
              <div>
                <div className="label accent">Online</div>
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
        </section>
      )}
    </Page>
  )
}
