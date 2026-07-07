import { expect, test } from '@playwright/test';

async function openFreshApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    const databases = await indexedDB.databases?.();
    await Promise.all(
      (databases ?? [])
        .map((db) => db.name)
        .filter((name): name is string => Boolean(name))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            }),
        ),
    );
  });
  await page.reload();
}

test('starter gallery: instantiate a bundled starter and edit it', async ({ page }) => {
  await openFreshApp(page);

  // Open the new-project modal from the title bar and switch to Starters.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('radio', { name: 'Starters' }).click();

  // Pick the announcement starter; it opens as an editable project.
  await page.getByRole('button', { name: /Announcement — Instagram square/i }).click();
  await expect(
    page.getByRole('button', { name: 'Announcement (IG square)' }),
  ).toBeVisible();

  // The canvas is live — the starter's layers render on a Konva stage.
  await expect(page.locator('.konvajs-content canvas').first()).toBeVisible();
});

test('editable HTML export mode is offered and produces a .html download', async ({ page }) => {
  await openFreshApp(page);

  await page.getByRole('button', { name: /Instagram square/i }).click();
  await expect(page.getByRole('button', { name: 'Untitled project' })).toBeVisible();

  const canvas = page.locator('.konvajs-content canvas').first();
  await page.locator('[data-tool="text"]').click();
  await canvas.click({ position: { x: 300, y: 240 }, force: true });

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('radio', { name: 'HTML' }).click();
  // The old raster wrapper is now clearly labelled; pick the editable mode.
  await expect(page.getByRole('radio', { name: 'Image wrapper' })).toBeVisible();
  await page.getByRole('radio', { name: 'Editable' }).click();

  const downloadPromise = page.waitForEvent('download');
  // Two "Export" buttons exist (title bar + dialog) — scope to the dialog.
  await page
    .getByLabel('Export', { exact: true })
    .getByRole('button', { name: 'Export', exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
});

test('missing-asset repair badge and modal appear for a broken import', async ({ page }) => {
  await openFreshApp(page);

  // Import a .calqo file whose image layer references an asset with no blob.
  const project = {
    kind: 'calqo.project',
    formatVersion: 1,
    assets: [],
    project: {
      schemaVersion: 1,
      id: 'proj-broken',
      name: 'Broken import',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      contentLocales: ['en'],
      activeContentLocale: 'en',
      palette: [],
      glossary: [],
      assets: [
        {
          id: 'asset-gone',
          kind: 'raster',
          name: 'gone.png',
          mimeType: 'image/png',
          storageKey: 'asset-gone',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      artboards: [
        {
          id: 'ab-1',
          name: 'Board',
          preset: 'ig-square',
          width: 1080,
          height: 1080,
          background: { type: 'solid', color: '#FFFFFF' },
          layers: [
            {
              id: 'img-1',
              name: 'Ghost image',
              type: 'image',
              x: 100,
              y: 100,
              w: 400,
              h: 300,
              rotation: 0,
              opacity: 1,
              visible: true,
              locked: false,
              assetId: 'asset-gone',
              fit: 'cover',
            },
          ],
        },
      ],
    },
  };

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import .calqo' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'broken.calqo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });

  // Detection fires on import: the repair modal opens automatically.
  await expect(page.getByRole('heading', { name: 'Repair assets' })).toBeVisible();
  await expect(page.getByText(/Ghost image/)).toBeVisible();

  // Keep the placeholder — editing is never blocked — and the status bar badge stays.
  await page.getByRole('button', { name: 'Keep placeholders' }).click();
  await expect(page.getByText(/1 missing asset/)).toBeVisible();
});
