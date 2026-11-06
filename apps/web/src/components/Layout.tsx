import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** The app name, shown in the header (and in the browser tab, see index.html). */
export const APP_NAME = 'Analizador de La Gaceta';

interface LayoutProps {
  /** The page. */
  children: ReactNode;
  /**
   * Extra controls at the right of the header. routes.tsx puts the
   * "Cerrar sesión" button here on every page except the login page.
   */
  headerActions?: ReactNode;
}

/** The frame around every page: header with the app name and links, then the page. */
export function Layout({ children, headerActions }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__header-content">
          <Link to="/" className="layout__app-name">
            <span className="layout__logo" aria-hidden="true">
              <DocumentIcon />
            </span>
            {APP_NAME}
          </Link>
          <nav aria-label="Principal" className="layout__nav">
            <Link to="/jobs/new" className="button button--primary">
              <PlusIcon />
              Nuevo análisis
            </Link>
            {headerActions}
          </nav>
        </div>
      </header>
      <main className="layout__main">{children}</main>
    </div>
  );
}

// Small decorative icons. `aria-hidden` keeps them out of what screen readers
// say, so the links are still read as "Analizador de La Gaceta" and
// "Nuevo análisis". `currentColor` paints them with the text color.

function DocumentIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
