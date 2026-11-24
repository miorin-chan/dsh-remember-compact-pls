# dsh-remember-compact-pls

An always-visible context-usage indicator under the composer, measured against an attention budget expressed in **k tokens**.

Long-context models (e.g. 1M-token windows) often lose attention long before the window is full, so a percentage-of-window meter is a weak signal. This plugin lets you set an absolute attention budget in k tokens and warns when usage approaches it.

## What it does

- Always shows a small pill under the composer while a session is open: `{used}k / {budget}k`.
- Turns amber at a configurable percentage of the budget (default 70%) and red at/after the budget.
- Clicking the pill switches it to an inline confirmation ("compact now? [Compact] [Cancel]"). Confirming fills `/compact` into the composer, so you press Enter to run it (nothing is sent automatically).
- Below the remind threshold, clicking instead shows "context length is safe" for a moment (no compaction prompt).

## Where it appears

- Composer dock, as an additional entry with the id `remember-compact-pls` (does not replace the built-in `usage` / `activity` entries).
- Settings > General, as a new row.

## Settings

| Field | Default | Meaning |
| --- | --- | --- |
| `thresholdK` | 300 | Attention budget in **thousands of tokens** (300 = 300k). |
| `remindPercent` | 70 | Percentage of the budget at which the pill starts highlighting. |

Both fields are the plugin's own Config and are `.volatile()`, so edits apply live without restarting the plugin.

## Install

Install as a local directory bundle, either route:

- GUI: **Plugins > Add plugin**, then select the plugin directory.
- `plugin_manager`: `install_bundle` with the absolute directory of this plugin.

## Development

```sh
npm run build      # src/host/index.ts -> index.js, src/client/index.ts -> client.js
npm run typecheck
```

The build wraps the client half for the browser module loader. The package declares no installed runtime dependencies; the host half imports the DSH-shipped `@deepseek-ai/schemastery` (resolved from the DSH installation), and build/typecheck reuse the sibling project's devDependencies.

## Non-destructive

- Only adds a new composer-dock entry and a new Settings row, both with fresh ids.
- Does not write session events, modify the system prompt, or override built-in components.
- Disabling or removing the plugin restores the original UI.
