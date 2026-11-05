import { Link } from 'react-router';

/** Shown on the home page before the first analysis exists (FR-05). */
export function EmptyJobList() {
  return (
    <div className="empty-job-list">
      <p>Todavía no hay análisis.</p>
      <Link to="/jobs/new" className="button button--primary">
        Crear el primer análisis
      </Link>
    </div>
  );
}
