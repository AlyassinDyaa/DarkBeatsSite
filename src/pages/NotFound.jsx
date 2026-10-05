import { Link } from 'react-router-dom'
import Page from '../components/Page'

export default function NotFound() {
  return (
    <Page title="Not found">
      <section className="notfound container">
        <div className="label accent">Error 404</div>
        <h1 className="display h-xl">Blank page</h1>
        <p className="lead">Nothing has been drawn at this address.</p>
        <Link className="btn" to="/">Back to the start <span className="arrow">→</span></Link>
      </section>
    </Page>
  )
}
