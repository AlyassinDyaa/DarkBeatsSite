import { useState } from 'react'
import { brand, gallerySections, pages } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import GalleryGrid from '../components/GalleryGrid'
import ViewSwitch from '../components/ViewSwitch'
import { useGalleryView } from '../hooks/useGalleryView'

/* Every picture, in the sections made in the admin panel. A section with nothing in it stays hidden. */
export default function Gallery() {
  const [on, setOn] = useState('all')
  const [view, setView] = useGalleryView()
  const shown = on === 'all' ? gallerySections : gallerySections.filter((s) => s.slug === on)
  const { label, title, intro } = pages.gallery
  return (
    <Page title="Gallery">
      <header className="page-head container">
        {label && <div className="label accent">{label}</div>}
        <h1 className="display h-xl">{title}</h1>
        {intro && <p className="lead">{intro}</p>}
        <div className="filters-row">
          {gallerySections.length > 1 && (
            <div className="filters" role="group" aria-label="Show">
              <button type="button" className={`chip ${on === 'all' ? 'on' : ''}`} aria-pressed={on === 'all'} onClick={() => setOn('all')}>All</button>
              {gallerySections.map((s) => (
                <button key={s.slug} type="button" className={`chip ${on === s.slug ? 'on' : ''}`} aria-pressed={on === s.slug} onClick={() => setOn(s.slug)}>
                  {s.title}<small>{s.items.length}</small>
                </button>
              ))}
            </div>
          )}
          <div className="section-tools">
            <ViewSwitch view={view} onChange={setView} />
            {brand.instagram && <a className="btn ghost sm" href={brand.instagram} target="_blank" rel="noreferrer">More on Instagram <span className="arrow">↗</span></a>}
          </div>
        </div>
      </header>

      <section className="section tight">
        <div className="container">
          {shown.map((s) => (
            <div className="gallery-group" key={s.slug}>
              <Reveal className="gallery-group-head">
                <h2 className="display h-md">{s.title}</h2>
                {s.description && <p className="dim">{s.description}</p>}
                <span>{s.items.length} {s.items.length === 1 ? 'picture' : 'pictures'}</span>
              </Reveal>
              <GalleryGrid items={s.items} view={view} />
            </div>
          ))}
          {gallerySections.length === 0 && <p className="dim">Pictures are on their way.</p>}
        </div>
      </section>
    </Page>
  )
}
