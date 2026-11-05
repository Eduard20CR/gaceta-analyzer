import type { RelevanceFilter } from '../lib/job-results';
import { RELEVANCE_FILTERS } from '../lib/job-results';
import { RELEVANCE_FILTER_LABELS } from './relevance-labels';

interface FindingsFilterProps {
  value: RelevanceFilter;
  /** How many findings each option shows. */
  counts: Record<RelevanceFilter, number>;
  onChange: (filter: RelevanceFilter) => void;
}

/**
 * Buttons to show only the findings of one relevance (FR-04). `aria-pressed`
 * tells screen readers which option is selected.
 */
export function FindingsFilter({
  value,
  counts,
  onChange,
}: FindingsFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filtrar por relevancia"
      className="findings-filter"
    >
      {RELEVANCE_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          className="findings-filter__option"
          aria-pressed={filter === value}
          onClick={() => onChange(filter)}
        >
          {RELEVANCE_FILTER_LABELS[filter]} ({counts[filter]})
        </button>
      ))}
    </div>
  );
}
