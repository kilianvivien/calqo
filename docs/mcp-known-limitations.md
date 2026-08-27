# Calqo MCP: known limitations

No known locale-management limitation remains. MCP agents can register and
switch project content locales in the same atomic, undoable operation batch as
their layer edits.

Agents should register every locale they write:

```json
{
  "operations": [
    { "type": "addContentLocale", "locale": "fr", "copyFrom": "en" }
  ]
}
```

`addContentLocale` activates the locale and optionally seeds missing text and
list values from `copyFrom`. `setActiveContentLocale` switches to any locale
already registered in `contentLocales`.

Image-capable agents can use `calqo_insert_image` to add a generated image or
an image they found and fetched from the web. The preferred handoff is an
absolute path to a PNG, JPEG, or WebP file already saved on the machine running
Calqo; this avoids moving image bytes through model context. A base64 data URL
remains available when a local path cannot be shared. Calqo intentionally does
not fetch remote URLs, preventing server-side request forgery and avoiding
forwarded browser cookies or signed-link credentials. Raster input is capped at
10 MiB.
