import type { ProjectSummary } from '@/lib/adapters';

export type ProjectSort =
  | 'updated-desc'
  | 'updated-asc'
  | 'name-asc'
  | 'name-desc';

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function searchable(value: string, locale: string): string {
  return value
    .toLocaleLowerCase(locale)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function filterAndSortProjectSummaries(
  summaries: ProjectSummary[],
  query: string,
  sort: ProjectSort,
  locale: string,
): ProjectSummary[] {
  const normalizedQuery = searchable(query.trim(), locale);
  const filtered = normalizedQuery
    ? summaries.filter((summary) =>
        searchable(summary.name, locale).includes(normalizedQuery),
      )
    : summaries;

  return [...filtered].sort((left, right) => {
    if (sort.startsWith('name')) {
      const result = left.name.localeCompare(right.name, locale, {
        sensitivity: 'base',
        numeric: true,
      });
      return sort === 'name-asc' ? result : -result;
    }

    const result = timestamp(left.updatedAt) - timestamp(right.updatedAt);
    return sort === 'updated-asc' ? result : -result;
  });
}
