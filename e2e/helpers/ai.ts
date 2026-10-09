import { expect, type Page } from '@playwright/test';
import { fixtureProject } from '../../src/lib/schema/fixture';

/** Exercise the real provider adapter without contacting an AI server. */
export async function enableTestAi(page: Page) {
  await page.route(
    'http://localhost:11434/v1/chat/completions',
    async (route) => {
      const request = route.request().postDataJSON() as {
        model: string;
        // Text-only requests send a string; vision requests send parts.
        messages: {
          role: string;
          content: string | { type: string; text?: string }[];
        }[];
      };
      const textOf = (content: (typeof request.messages)[number]['content']) =>
        typeof content === 'string'
          ? content
          : content.map((part) => part.text ?? '').join('');
      expect(route.request().method()).toBe('POST');
      expect(request.model).toBe('gemma4');
      const system = textOf(
        request.messages.find((message) => message.role === 'system')!.content,
      );
      const user = textOf(
        request.messages.find((message) => message.role === 'user')!.content,
      );
      let result: unknown;
      if (system.startsWith('You are a senior graphic designer')) {
        // Answer design edits as a real streamed reply, reasoning included, so
        // the smoke path covers the SSE reader too.
        const { artboard } = JSON.parse(user) as {
          artboard: { layers: { id: string }[] };
        };
        const answer = JSON.stringify({
          summary: 'Renamed the first layer.',
          operations: [
            {
              type: 'updateLayer',
              layerId: artboard.layers[0].id,
              patch: { name: 'AI renamed layer' },
            },
          ],
        });
        const events = [
          { choices: [{ delta: { reasoning_content: 'Planning the edit.' } }] },
          { choices: [{ delta: { content: answer.slice(0, 20) } }] },
          { choices: [{ delta: { content: answer.slice(20) } }] },
        ];
        await route.fulfill({
          contentType: 'text/event-stream',
          body: `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
        });
        return;
      }
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
