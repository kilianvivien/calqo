import { expect, type Page } from '@playwright/test';
import { fixtureProject } from '../../src/lib/schema/fixture';

/** Exercise the real provider adapter without contacting an AI server. */
export async function enableTestAi(page: Page) {
  await page.route(
    'http://localhost:11434/v1/chat/completions',
    async (route) => {
      const request = route.request().postDataJSON() as {
        model: string;
        messages: { role: string; content: string }[];
      };
      expect(route.request().method()).toBe('POST');
      expect(request.model).toBe('llama3.1');
      const system = request.messages.find(
        (message) => message.role === 'system',
      )!.content;
      const user = request.messages.find(
        (message) => message.role === 'user',
      )!.content;
      let result: unknown;
      if (system.startsWith('You are a professional translator.')) {
        const { items } = JSON.parse(user) as {
          items: { layerId: string; sourceText: string }[];
        };
        result = {
          items: items.map((item) => ({
            layerId: item.layerId,
            translatedText: `Traduction : ${item.sourceText}`,
          })),
        };
      } else {
        expect(user).toMatch(/^Design brief: /);
        result = {
          ...fixtureProject,
          name: user.replace(/^Design brief: /, ''),
        };
      }
      await route.fulfill({
        json: { choices: [{ message: { content: JSON.stringify(result) } }] },
      });
    },
  );

  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'AI provider' }).click();
  await expect(
    settings.getByLabel('Provider').locator('option[value="demo"]'),
  ).toHaveCount(0);
  await settings.getByLabel('Provider').selectOption('local');
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(
    page.getByRole('button', { name: 'Prompt a template' }),
  ).toBeVisible();
}
