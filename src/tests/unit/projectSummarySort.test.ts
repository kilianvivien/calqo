import { describe, expect, it } from 'vitest';
import { filterAndSortProjectSummaries } from '@/app/shell/projectSummarySort';
import type { ProjectSummary } from '@/lib/adapters';

const projects: ProjectSummary[] = [
  {
    id: '2',
    name: 'Projet 10',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  },
  {
    id: '1',
    name: 'Été',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  },
  {
    id: '3',
    name: 'Projet 2',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
  },
];

describe('project summary filtering and sorting', () => {
  it('filters names without case or accent sensitivity in the active locale', () => {
    expect(
      filterAndSortProjectSummaries(projects, 'ete', 'updated-desc', 'fr').map(
        ({ id }) => id,
      ),
    ).toEqual(['1']);
    expect(
      filterAndSortProjectSummaries(
        projects,
        'PROJET',
        'updated-desc',
        'fr',
      ).map(({ id }) => id),
    ).toEqual(['2', '3']);
  });

  it('sorts by update date in either direction', () => {
    expect(
      filterAndSortProjectSummaries(projects, '', 'updated-desc', 'fr').map(
        ({ id }) => id,
      ),
    ).toEqual(['1', '2', '3']);
    expect(
      filterAndSortProjectSummaries(projects, '', 'updated-asc', 'fr').map(
        ({ id }) => id,
      ),
    ).toEqual(['3', '2', '1']);
  });

  it('uses locale-aware natural name ordering in either direction', () => {
    expect(
      filterAndSortProjectSummaries(projects, '', 'name-asc', 'fr').map(
        ({ id }) => id,
      ),
    ).toEqual(['1', '3', '2']);
    expect(
      filterAndSortProjectSummaries(projects, '', 'name-desc', 'fr').map(
        ({ id }) => id,
      ),
    ).toEqual(['2', '3', '1']);
  });

  it('does not mutate the adapter result', () => {
    const originalOrder = projects.map(({ id }) => id);
    filterAndSortProjectSummaries(projects, '', 'name-asc', 'fr');
    expect(projects.map(({ id }) => id)).toEqual(originalOrder);
  });
});
