/** HTML wrapper export (plan §12.4). Intentionally simple: a sized box around a
 * base64 PNG of the artboard, offered as an embeddable snippet or a complete
 * standalone document. */

export interface HtmlExportInput {
  title: string;
  width: number;
  height: number;
  pngDataUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** An embeddable `<div>` snippet that sizes and contains the image. */
export function htmlSnippet({ title, width, height, pngDataUrl }: HtmlExportInput): string {
  const alt = escapeHtml(title);
  return `<div class="calqo-embed" style="width:${width}px;height:${height}px;max-width:100%">
  <img
    alt="${alt}"
    src="${pngDataUrl}"
    width="${width}"
    height="${height}"
    style="display:block;width:100%;height:100%;object-fit:contain"
  />
</div>`;
}

/** A complete, self-contained HTML document wrapping the snippet. */
export function htmlStandalone(input: HtmlExportInput): string {
  const title = escapeHtml(input.title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b0b0c;
      }
    </style>
  </head>
  <body>
${htmlSnippet(input)
  .split('\n')
  .map((line) => `    ${line}`)
  .join('\n')}
  </body>
</html>`;
}
