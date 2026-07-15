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
