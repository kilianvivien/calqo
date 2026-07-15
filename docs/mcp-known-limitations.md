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
an image they found and fetched from the web. The agent must pass the final PNG,
JPEG, or WebP bytes as a base64 data URL; Calqo intentionally does not fetch
remote URLs. This prevents server-side request forgery and avoids forwarding
browser cookies or signed-link credentials. Raster input is capped at 10 MiB.
