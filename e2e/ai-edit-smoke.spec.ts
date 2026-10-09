import { expect, test } from '@playwright/test';
import { enableTestAi } from './helpers/ai';

test('prompt a template with no project open, then edit it with AI', async ({
  page,
}) => {
  await page.goto('/');
  await enableTestAi(page);

  // Prompt-a-template creates its own project, so it must work from the
  // empty workspace.
  await page.getByRole('button', { name: 'Prompt a template' }).click();
  const templateDialog = page.getByRole('dialog', {
    name: 'Prompt a template',
  });
  await templateDialog
    .getByRole('textbox')
    .first()
    .fill('Streamed launch card');
  await templateDialog.getByRole('button', { name: 'Generate' }).click();
  await expect(templateDialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Streamed launch card' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Edit with AI' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit with AI' });
  await editDialog.getByRole('textbox').fill('Rename the first layer');
  await editDialog.getByRole('button', { name: 'Apply' }).click();
  await expect(editDialog.getByText('Renamed the first layer.')).toBeVisible();

  await editDialog.getByRole('button', { name: 'Close' }).last().click();
  await page.getByRole('tab', { name: 'Layers' }).click();
  const layers = page.getByRole('tabpanel');
  await expect(
    layers.getByRole('button', { name: 'AI renamed layer' }),
  ).toBeVisible();

  // The whole edit is a single undo step.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    layers.getByRole('button', { name: 'AI renamed layer' }),
  ).toHaveCount(0);
});
