import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="app-header">
      <nav className="app-header__nav">
        <div className="app-header__link">
          <Link to="/" search={{ q: undefined }}>Home</Link>
        </div>

        <div className="app-header__link">
          <Link to="/demo/start/server-funcs">Start - Server Functions</Link>
        </div>

        <div className="app-header__link">
          <Link to="/demo/start/api-request">Start - API Request</Link>
        </div>

        <div className="app-header__link">
          <Link to="/demo/start/ssr">Start - SSR Demos</Link>
        </div>
      </nav>
    </header>
  )
}
