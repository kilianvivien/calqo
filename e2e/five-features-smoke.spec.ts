import { expect, test } from '@playwright/test';

async function downloadBuffer(download: import('@playwright/test').Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

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

async function enableMockAi(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'AI provider' }).click();
  await settings.getByLabel('Provider').selectOption('custom');
  await settings.getByLabel('Base URL').fill('');
  await settings.getByLabel('Model').fill('');
  await settings.getByRole('button', { name: 'Close' }).click();
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

  // Edit the copy, then instantiate the bundled source again. Two independent
  // project tabs with the same source name prove the starter itself was not mutated.
  await page.locator('[data-tool="text"]').click();
  await page.locator('.konvajs-content canvas').first().click({ position: { x: 240, y: 180 }, force: true });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('radio', { name: 'Starters' }).click();
  await page.getByRole('button', { name: /Announcement — Instagram square/i }).click();
  await expect(page.getByRole('button', { name: 'Announcement (IG square)' })).toHaveCount(3);

  // Save the active copy as a user starter and round-trip it through the gallery.
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Projects' }).click();
  const manager = page.getByRole('dialog', { name: 'Projects' });
  await manager.getByRole('button', { name: 'Save as starter' }).first().click();
  await page.waitForTimeout(800);
  await manager.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('radio', { name: 'Starters' }).click();
  await expect(page.getByText('My starters')).toBeVisible();
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

test('editable HTML faithful fixture stays selectable and visually close to PNG', async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole('button', { name: /Instagram square/i }).click();
  const canvas = page.locator('.konvajs-content canvas').first();
  await page.locator('[data-tool="text"]').click();
  await canvas.click({ position: { x: 300, y: 240 }, force: true });

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: '1x' }).click();
  let pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const png = await downloadBuffer(await pending);

  await dialog.getByRole('radio', { name: 'HTML' }).click();
  await dialog.getByRole('radio', { name: 'Editable' }).click();
  pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const html = (await downloadBuffer(await pending)).toString('utf8');
  expect(html).toContain('<p data-layer=');

  await page.setContent(html);
  await expect(page.locator('.calqo-artboard p')).toHaveCSS('user-select', 'auto');
  const htmlPng = await page.locator('.calqo-artboard').screenshot();
  const difference = await page.evaluate(async ({ expected, actual }) => {
    const load = (source: string) => new Promise<HTMLImageElement>((resolve) => {
      const image = new Image(); image.onload = () => resolve(image); image.src = source;
    });
    const [a, b] = await Promise.all([
      load(`data:image/png;base64,${expected}`),
      load(`data:image/png;base64,${actual}`),
    ]);
    const width = Math.min(a.width, b.width); const height = Math.min(a.height, b.height);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.drawImage(a, 0, 0, width, height); const one = context.getImageData(0, 0, width, height).data;
    context.clearRect(0, 0, width, height); context.drawImage(b, 0, 0, width, height); const two = context.getImageData(0, 0, width, height).data;
    let delta = 0;
    for (let i = 0; i < one.length; i += 4) delta += Math.abs(one[i] - two[i]) + Math.abs(one[i + 1] - two[i + 1]) + Math.abs(one[i + 2] - two[i + 2]);
    return delta / (width * height * 3 * 255);
  }, { expected: png.toString('base64'), actual: htmlPng.toString('base64') });
  expect(difference).toBeLessThan(0.18);
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

  const replacementChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Relink…' }).click();
  const replacement = await replacementChooser;
  await replacement.setFiles({
    name: 'replacement.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(page.getByText('All asset references are resolved.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText(/missing asset/)).toHaveCount(0);

  // The relink remains exactly one undoable edit and redo restores the repair.
  await page.keyboard.press('Meta+z');
  await expect(page.getByText(/1 missing asset/)).toBeVisible();
  await page.keyboard.press('Meta+Shift+z');
  await expect(page.getByText(/1 missing asset/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export' }).getByText(/missing asset/)).toHaveCount(0);
});

test('asset health: oversized import previews and applies an undoable optimization', async ({ page }) => {
  await openFreshApp(page);

  // Lower only the warning edge so a compact deterministic fixture exercises
  // the same flow as a large phone photo without bloating the repository.
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Long edge (px)').fill('50');
  await settings.getByLabel('Long edge (px)').blur();
  await settings.getByRole('button', { name: 'Close' }).click();

  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 100;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#E85D3F'; context.fillRect(0, 0, 100, 100);
    return canvas.toDataURL('image/png');
  });
  const envelope = {
    kind: 'calqo.project', formatVersion: 1,
    assets: [{ id: 'large', name: 'large.png', mimeType: 'image/png', dataUrl }],
    project: {
      schemaVersion: 1, id: 'health-fixture', name: 'Health fixture',
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      contentLocales: ['en'], activeContentLocale: 'en', palette: [], glossary: [],
      assets: [{ id: 'large', kind: 'raster', name: 'large.png', mimeType: 'image/png', width: 100, height: 100, storageKey: 'large', createdAt: '2026-07-01T00:00:00.000Z' }],
      artboards: [{ id: 'ab', name: 'Board', preset: 'ig-square', width: 1080, height: 1080, background: { type: 'solid', color: '#fff' }, layers: [{ id: 'image', name: 'Small use', type: 'image', x: 10, y: 10, w: 10, h: 10, rotation: 0, opacity: 1, visible: true, locked: false, assetId: 'large', fit: 'cover' }] }],
    },
  };
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import .calqo' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'health.calqo', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(envelope)) });
  await expect(page.getByRole('status')).toContainText('large.png');
  await page.getByRole('status').getByRole('button', { name: 'Optimize assets…' }).click();
  const optimize = page.getByRole('dialog', { name: 'Optimize assets' });
  await expect(optimize.getByText(/100×100px.*→.*30×30px/)).toBeVisible();
  await optimize.getByRole('button', { name: 'Apply (1)' }).click();
  await expect(optimize.getByText(/Optimized 1 asset/)).toBeVisible();
  await optimize.getByRole('button', { name: 'Close' }).first().click();

  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+Shift+z');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export' }).getByText(/large.png is large/)).toHaveCount(0);
});

test('Brand Lite applies a profile to projects, prompt generation, and logo insertion', async ({ page }) => {
  await openFreshApp(page);
  await enableMockAi(page);

  await page.getByRole('button', { name: 'Open settings' }).click();
  let settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Brand' }).click();
  await settings.getByRole('button', { name: 'Add', exact: true }).click();
  await settings.getByLabel('Name').fill('Acme');
  await settings.getByLabel('Heading font').selectOption('Space Grotesk');
  await settings.getByLabel('Body font').selectOption('Inter');
  await settings.getByLabel('Pick a color').fill('#112233');
  await settings.getByText('Palette').locator('..').getByRole('button', { name: 'Add' }).click();
  const logoChooserPromise = page.waitForEvent('filechooser');
  await settings.getByRole('button', { name: 'Upload logo' }).click();
  const logoChooser = await logoChooserPromise;
  await logoChooser.setFiles({
    name: 'logo.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  });
  await page.waitForTimeout(500);
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'New', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Choose a format' });
  await create.getByLabel('Brand').selectOption({ label: 'Acme' });
  await create.getByRole('button', { name: /Instagram square/i }).click();

  await page.getByRole('button', { name: 'Open settings' }).click();
  settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Brand' }).click();
  await settings.getByRole('button', { name: 'Insert into current project' }).click();
  await expect(settings.getByText('Logo inserted into the open project.')).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Prompt a template' }).click();
  const prompt = page.getByRole('dialog', { name: 'Prompt a template' });
  await prompt.getByLabel('Brand').selectOption({ label: 'Acme' });
  await prompt.getByPlaceholder(/bold sale announcement/i).fill('Acme launch');
  await prompt.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByRole('button', { name: 'Acme launch', exact: true })).toBeVisible();
});
