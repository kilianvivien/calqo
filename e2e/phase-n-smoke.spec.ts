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

async function enableMockAi(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'AI provider' }).click();
  await settings.getByLabel('Provider').selectOption('custom');
  await settings.getByLabel('Base URL').fill('');
  await settings.getByLabel('Model').fill('');
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Prompt a template' })).toBeVisible();
}

test('create-edit-translate-prompt-export-reload smoke path', async ({ page }) => {
  await openFreshApp(page);
  await enableMockAi(page);

  await page.getByRole('button', { name: /Instagram square/i }).click();
  await expect(page.getByRole('button', { name: 'Untitled project' })).toBeVisible();

  const canvas = page.locator('.konvajs-content canvas').first();
  const inspectorPanel = page.getByRole('tabpanel');
  await expect(canvas).toBeVisible();

  await page.locator('[data-tool="text"]').click();
  await canvas.click({ position: { x: 360, y: 260 }, force: true });

  await page.locator('[data-tool="rect"]').click();
  await canvas.dragTo(canvas, {
    sourcePosition: { x: 380, y: 380 },
    targetPosition: { x: 520, y: 470 },
    force: true,
  });

  await page.locator('[data-tool="image"]').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await canvas.click({ position: { x: 560, y: 310 }, force: true });
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'placeholder.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
  });

  await page.getByRole('tab', { name: 'Layers' }).click();
  await inspectorPanel.getByRole('button', { name: 'Text' }).dblclick();
  await inspectorPanel.getByRole('textbox').fill('Alpha headline');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Alpha headline' })).toBeVisible();

  await page.getByRole('tab', { name: 'Style' }).click();
  await page.getByLabel('Add a content locale').selectOption('fr');
  await inspectorPanel.getByRole('button', { name: 'Add', exact: true }).click();

  await page.getByLabel('Translate').click();
  const translateDialog = page.getByRole('dialog', { name: 'Translate content' });
  await translateDialog.getByRole('button', { name: /^Translate$/ }).click();
  await expect(translateDialog.getByRole('button', { name: 'Apply' })).toBeEnabled();
  await translateDialog.getByRole('button', { name: 'Apply' }).click();

  await page.getByRole('button', { name: 'Prompt a template' }).click();
  await page.getByPlaceholder(/bold sale announcement/i).fill('Bold coffee launch post');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(
    page.getByRole('button', { name: 'Bold coffee launch post', exact: true }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page
    .getByRole('dialog', { name: 'Export' })
    .getByRole('button', { name: /^Export$/ })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Bold coffee launch post', exact: true }),
  ).toBeVisible();
});

test('visual smoke checkpoints', async ({ page }) => {
  await openFreshApp(page);
  await enableMockAi(page);
  await expect(page.getByText('Choose a format')).toBeVisible();
  await page.screenshot({ path: 'test-results/empty-workspace.png', fullPage: true });

  await page.getByRole('button', { name: 'Open sample project' }).click();
  await page.getByRole('tab', { name: 'Layers' }).click();
  await page.getByRole('button', { name: 'Headline' }).click();
  await page.screenshot({ path: 'test-results/sample-selected-light.png', fullPage: true });

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.screenshot({ path: 'test-results/sample-selected-dark.png', fullPage: true });

  await page.evaluate(() => {
    localStorage.setItem('calqo-transparency', 'solid');
    document.documentElement.setAttribute('data-transparency', 'solid');
  });
  await page.screenshot({
    path: 'test-results/sample-selected-solid-transparency.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Translate' }).click();
  await page.screenshot({ path: 'test-results/translate-dialog-en.png', fullPage: true });
  await page.keyboard.press('Escape');

  await page.evaluate(() => localStorage.setItem('calqo-language', 'fr'));
  await page.reload();
  await page.getByRole('button', { name: 'Traduire' }).click();
  await page.screenshot({ path: 'test-results/translate-dialog-fr.png', fullPage: true });
});
