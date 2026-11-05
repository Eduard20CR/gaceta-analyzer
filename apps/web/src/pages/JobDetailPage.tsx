import { useParams } from 'react-router';

// Placeholder: the real page is built in M4 (#40).
export function JobDetailPage() {
  // The route is /jobs/:id, so `id` is always present here.
  const { id } = useParams();
  return (
    <>
      <h1>Detalle del análisis</h1>
      <p>Análisis {id}</p>
    </>
  );
}
