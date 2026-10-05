import { useState } from 'react'
import { Link } from 'react-router-dom'
import { brand, contact, shows, social } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Picker from '../components/Picker'
import SocialIcon from '../components/SocialIcon'

export default function Contact() {
  const [sent, setSent] = useState(false)
  const submit = (e) => {
    if (brand.contactAction) return
    e.preventDefault()
    const d = new FormData(e.target)
    const body = encodeURIComponent(`${d.get('message')}\n\n— ${d.get('name')} (${d.get('email')})`)
    window.location.href = `mailto:${brand.email}?subject=${encodeURIComponent(`${d.get('topic') ? `[${d.get('topic')}] ` : ''}Message from ${d.get('name')}`)}&body=${body}`
    setSent(true)
  }
  return (
    <Page title="Contact">
      <header className="page-head container">
        {contact.label && <div className="label accent">{contact.label}</div>}
        <h1 className="display h-xl">{contact.title}</h1>
        <p className="lead">{contact.intro}</p>
      </header>
      <section className="section tight">
        <div className="container request">
          <Reveal>
            <form onSubmit={submit} action={brand.contactAction || undefined} method={brand.contactAction ? 'post' : undefined}>
              <div className="field"><input id="name" name="name" type="text" placeholder=" " required autoComplete="name" /><label htmlFor="name">Your name</label><span className="bar" /></div>
              <div className="field"><input id="email" name="email" type="email" placeholder=" " required autoComplete="email" /><label htmlFor="email">Email</label><span className="bar" /></div>
              {contact.topics.length > 0 && <Picker label="About" name="topic" options={contact.topics} />}
              <div className="field"><textarea id="message" name="message" placeholder=" " required rows={5} /><label htmlFor="message">Message</label><span className="bar" /></div>
              <Magnetic><button className="btn" type="submit">{sent ? 'Opening your mail app…' : 'Send message'} <span className="arrow">→</span></button></Magnetic>
            </form>
          </Reveal>
          <Reveal delay={0.1} className="contact-side">
            {brand.email && (
              <div>
                <div className="label">Email</div>
                <a className="footer-mail" href={`mailto:${brand.email}`}>{brand.email}</a>
              </div>
            )}
            {shows('pages', 'commissions') && (
              <div>
                <div className="label">Want a piece drawn?</div>
                <p className="dim">Commission requests have their own form, with room for the details.</p>
                <Link className="btn ghost sm" to="/commissions">Commissions <span className="arrow">→</span></Link>
              </div>
            )}
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
          </Reveal>
        </div>
      </section>
    </Page>
  )
}
