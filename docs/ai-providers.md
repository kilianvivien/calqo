# AI providers: setup and privacy

Calqo's AI features are optional and off by default. Nothing is sent anywhere
until you pick a provider in **Settings ▸ AI provider** and run an AI action.
Creating, editing, saving and exporting never need AI or a network connection.

## What the AI can do

| Feature               | Where                               | What happens                                                                                                                       |
| --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Prompt a template** | Title bar ✦, AI menu                | Drafts a new editable project from a brief. Works with no project open.                                                            |
| **Edit with AI**      | Title bar wand, AI menu             | Changes the current artboard from an instruction. Applied as one undo step; nothing changes if any part of the answer is invalid. |
| **Rewrite copy**      | Properties ▸ Text, per locale       | Shorten, rephrase, change tone or proofread one text layer.                                                                        |
| **Translate**         | Title bar, Style ▸ Content locales  | Fills one or several target languages in a single pass, then asks for shorter wording where a translation overflows its box.       |
| **Generate SVG**      | Insert SVG ▸ Generate (AI)          | Draws a small icon, sanitised before it is inserted.                                                                               |

Everything the AI produces is ordinary Calqo content: real text, shapes,
gradients and groups you can keep editing by hand.

**Edit with AI** is limited on purpose. It can move, resize, restyle, add,
delete, group and reorder layers and change the artboard background. It cannot
create images or SVGs, touch locked layers, edit other artboards, or author
animation. Select layers first to aim the request at them.

## Choosing a provider

| Provider                 | Runs where          | Needs                                    | Default model           |
| ------------------------ | ------------------- | ---------------------------------------- | ----------------------- |
| Apple Intelligence       | On your Mac         | macOS app, macOS 27+, eligible Mac       | system model            |
| Local (Ollama)           | Your own machine    | A running Ollama (or compatible) server  | `gemma4`                |
| Google Gemini            | Google              | API key                                  | `gemini-3.8-flash`      |
| Anthropic Claude         | Anthropic           | API key                                  | `claude-opus-5-5`       |
| OpenAI                   | OpenAI              | API key                                  | `gpt-6.1-sol`           |
| Mistral AI               | Mistral             | API key                                  | `mistral-medium-latest` |
| OpenRouter               | OpenRouter + vendor | API key                                  | `openrouter/free`       |
| Custom endpoint          | Wherever you point  | An OpenAI-compatible `/chat/completions` | none — you choose       |

### Picking a model

The **Model** field accepts any model id. The round-arrow button next to it
loads the list your endpoint and key can actually use, so a model released
after this version of Calqo is selectable without an update. Type to filter the
list; "images" marks models known to accept image input and "free" marks models
listed at no cost.

Defaults change between releases as providers retire models. If you never
changed the model, Calqo moves you to the new default automatically; a model
you chose yourself is left alone.

### Getting the best results

- **Images help.** With a model that accepts image input, the style-reference
  sample you upload is sent so the AI can echo its layout and mood, and _Edit
  with AI_ sends a small rendering of the artboard so it can judge spacing and
  contrast. Without image support only the sample's colours are used.
- **Bigger models draft better layouts.** Small local models work for copy
  rewrites and translation; template generation and design edits benefit from a
  stronger model.
- **Reasoning models are supported.** Replies are streamed, so a model that
  thinks for a minute or two is not cut off. A request only stops after 90
  seconds with no data at all, or 10 minutes in total. You can cancel any time.

## What is sent, and where

Calqo has no server of its own. Requests go straight from the app on your
device to the provider you selected, using your own key.

| Action             | Sent to the provider                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Prompt a template  | Your brief, the canvas size, allowed fonts, palette colours, optional brand font names, optional reference image |
| Edit with AI       | Your instruction and the current artboard's layers (positions, text, styles); optionally a small rendering of it |
| Rewrite copy       | The text of that one layer and its layer name                                                                     |
| Translate          | The text being translated, layer names as context, and your glossary                                              |
| Generate SVG       | Your description and the chosen colour                                                                            |
| Load model list    | Only your key, to the provider's model-list endpoint                                                              |

Never sent: your API keys to anyone but the provider they belong to, other
projects, or brand profile assets. The image and SVG files placed in a design
are not uploaded either — but the artboard rendering that _Edit with AI_ sends
to image-capable models shows whatever is visible on the artboard, photos
included.

With **Apple Intelligence** or a **local** server the content stays on your
machine. With a hosted provider it is processed under that provider's terms and
retention policy — check them before sending confidential material.

## API keys

- **macOS app:** keys are stored in the macOS Keychain.
- **Browser:** keys are kept for the session only, unless you tick _Remember
  key_. The browser is not a secure keychain; remembered keys live in this
  site's storage.
- Keys are never written into `.calqo` files, app backups, diagnostics or logs.

Because requests are made from the app itself, use a key you are comfortable
keeping on this device, and prefer a key with a spending limit.

## When something goes wrong

- **"The generated project was invalid" / "changes could not be applied"** —
  Calqo validates everything before it reaches your design and retries once
  with the errors fed back. If it still fails, nothing was changed. _Copy raw
  output_ lets you inspect what the model returned. A stronger model usually
  fixes this.
- **"The design changed while the AI was working"** — you edited the project
  during an _Edit with AI_ request. Nothing was applied; run it again.
- **A note about a dropped capability** — if a model rejects a JSON schema,
  image input, a custom temperature or streaming, Calqo retries without it and
  tells you. The result is still validated.
- **The model list will not load** — check the key and endpoint. You can
  always type a model id by hand.
- **Local server unreachable in the browser** — a web page can only reach
  `localhost` on the same computer, and your server must allow requests from
  the page (for Ollama, set `OLLAMA_ORIGINS`).
