import { Link } from 'react-router';

/** Shown on the home page before the first analysis exists (FR-05). */
export function EmptyJobList() {
  return (
    <div className="empty-job-list card">
      <span className="empty-job-list__icon" aria-hidden="true">
        <EmptyDocumentsIcon />
      </span>
      <p className="empty-job-list__text">Todavía no hay análisis.</p>
      <Link to="/jobs/new" className="button button--primary">
        Crear el primer análisis
      </Link>
    </div>
  );
}

/** Decorative: two stacked documents. The text next to it says what it means. */
function EmptyDocumentsIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 7V5a2 2 0 0 1 2-2h6l4 4v10a2 2 0 0 1-2 2h-2" />
      <path d="M14 9H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8z" />
      <path d="M7 14h6M7 17h4" />
    </svg>
  );
}
