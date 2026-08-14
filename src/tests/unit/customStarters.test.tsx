import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewProjectModal } from '@/app/shell/NewProjectModal';
import { starterLibrary } from '@/lib/adapters';
import type { CalqoFile, StarterRecord } from '@/lib/adapters';
import { buildAppBackup, restoreAppBackup } from '@/editor/backup/appBackup';
import {
  duplicateUserStarter,
  exportUserStarter,
  listUserStarters,
} from '@/editor/starters/starterService';
import { createDefaultProject } from '@/lib/schema';

const downloads = vi.hoisted(() => ({
  calls: [] as { name: string; blob: Blob }[],
}));

vi.mock('@/lib/adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adapters')>();
  return {
    ...actual,
    files: {
      ...actual.files,
      downloadBlob: async (blob: Blob, name: string) => {
        downloads.calls.push({ blob, name });
      },
    },
  };
});

/* The bundled catalogue is unreachable under jsdom, so it resolves in the same
 * microtask queue as the library read and the two land in whichever order the
 * scheduler picks. Pushing the library read past a macrotask pins the order the
 * gallery actually sees in the browser — catalogue first, library second — which
 * is exactly the sequence that used to drop saved starters on the floor. */
vi.mock('@/editor/starters/starterService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/editor/starters/starterService')>();
  return {
    ...actual,
    listUserStarters: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return actual.listUserStarters();
    },
  };
});

/** jsdom's Blob has no `text()`; FileReader is the portable way to read one. */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read blob.'));
    reader.readAsText(blob);
  });
}

function envelopeFor(name: string): CalqoFile {
  const project = { ...createDefaultProject(), name };
  return { kind: 'calqo.project', formatVersion: 1, project, assets: [] };
}

async function saveRecord(name: string): Promise<StarterRecord> {
  const now = new Date().toISOString();
  const record: StarterRecord = {
    id: `starter_${name}`,
    name,
    createdAt: now,
    updatedAt: now,
    envelope: envelopeFor(name),
  };
  await starterLibrary.saveStarter(record);
  return record;
}

async function clearLibrary() {
  for (const record of await starterLibrary.listStarters()) {
    await starterLibrary.deleteStarter(record.id);
  }
}

async function openStartersTab() {
  await act(async () => {
    render(
      <NewProjectModal open onClose={() => undefined} initialTab="starters" />,
    );
  });
}

describe('custom starter library', () => {
  beforeEach(async () => {
    downloads.calls = [];
    await clearLibrary();
  });

  afterEach(async () => {
    await clearLibrary();
  });

  it('shows saved starters in the gallery once the bundled catalogue lands', async () => {
    await saveRecord('Campaign base');
    await openStartersTab();

    // Regression guard: the user library used to be read inside the effect that
    // loaded the bundled catalogue, so storing the catalogue tore that effect
    // down and the library result was discarded — saved starters never showed.
    await waitFor(() =>
      expect(screen.getByText('Campaign base')).toBeInTheDocument(),
    );
    expect(screen.getByText('My starters')).toBeInTheDocument();
  });

  it('always offers the custom category, with guidance while it is empty', async () => {
    await openStartersTab();

    const chip = await screen.findByRole('button', { name: 'My starters' });
    await act(async () => {
      await userEvent.click(chip);
    });

    expect(
      screen.getByText(/have not saved any starters yet/i),
    ).toBeInTheDocument();
  });

  it('counts the library on the category chip', async () => {
    await saveRecord('One');
    await saveRecord('Two');
    await openStartersTab();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'My starters (2)' }),
      ).toBeInTheDocument(),
    );
  });

  it('exposes rename, duplicate, export and delete actions per starter', async () => {
    await saveRecord('Campaign base');
    await openStartersTab();

    await waitFor(() =>
      expect(screen.getByText('Campaign base')).toBeInTheDocument(),
    );
    for (const label of [
      'Rename starter',
      'Duplicate starter',
      'Export starter as .calqo',
      'Delete starter',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('refreshes the gallery after a duplicate', async () => {
    await saveRecord('Campaign base');
    await openStartersTab();

    const duplicate = await screen.findByRole('button', {
      name: 'Duplicate starter',
    });
    await act(async () => {
      await userEvent.click(duplicate);
    });

    await waitFor(() =>
      expect(screen.getAllByText('Campaign base')).toHaveLength(2),
    );
  });
});

describe('starter library management', () => {
  beforeEach(async () => {
    downloads.calls = [];
    await clearLibrary();
  });

  afterEach(async () => {
    await clearLibrary();
  });

  it('duplicates a starter under a fresh id without touching the original', async () => {
    const source = await saveRecord('Campaign base');

    const copy = await duplicateUserStarter(source.id);

    expect(copy).toBeTruthy();
    expect(copy!.id).not.toBe(source.id);
    expect(copy!.envelope).toEqual(source.envelope);
    const list = await listUserStarters();
    expect(list).toHaveLength(2);
    expect(await starterLibrary.getStarter(source.id)).toMatchObject({
      id: source.id,
      name: 'Campaign base',
    });
  });

  it('returns null when duplicating a starter that no longer exists', async () => {
    expect(await duplicateUserStarter('starter_missing')).toBeNull();
  });

  it('exports a starter as a portable .calqo envelope', async () => {
    const record = await saveRecord('Campaign base');

    await exportUserStarter(record);

    expect(downloads.calls).toHaveLength(1);
    expect(downloads.calls[0].name).toBe('campaign-base.calqo');
    const parsed = JSON.parse(
      await readBlobText(downloads.calls[0].blob),
    ) as CalqoFile;
    expect(parsed.kind).toBe('calqo.project');
    expect(parsed.project.name).toBe('Campaign base');
  });
});

describe('app backup', () => {
  beforeEach(async () => {
    await clearLibrary();
  });

  afterEach(async () => {
    await clearLibrary();
  });

  it('carries the custom starter library through backup and restore', async () => {
    const source = await saveRecord('Campaign base');

    const backup = await buildAppBackup();
    expect(backup.starters?.map((entry) => entry.name)).toEqual([
      'Campaign base',
    ]);

    await clearLibrary();
    const result = await restoreAppBackup(backup);

    expect(result.starters).toBe(1);
    const restored = await listUserStarters();
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe('Campaign base');
    // Additive restore: a fresh id, never the one already in the library.
    expect(restored[0].id).not.toBe(source.id);
    expect(restored[0].envelope.project.name).toBe('Campaign base');
  });

  it('restores a backup written before starters were included', async () => {
    const backup = await buildAppBackup();
    delete backup.starters;

    const result = await restoreAppBackup(backup);

    expect(result.starters).toBe(0);
    expect(await listUserStarters()).toHaveLength(0);
  });
});
