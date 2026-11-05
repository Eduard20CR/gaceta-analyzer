import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** The app name, shown in the header (and in the browser tab, see index.html). */
export const APP_NAME = 'Analizador de La Gaceta';

interface LayoutProps {
  /** The page. */
  children: ReactNode;
  /**
   * Extra controls at the right of the header. The login work (#37) puts the
   * "Cerrar sesión" button here.
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
            {APP_NAME}
          </Link>
          <nav aria-label="Principal" className="layout__nav">
            <Link to="/jobs/new" className="layout__nav-link">
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
