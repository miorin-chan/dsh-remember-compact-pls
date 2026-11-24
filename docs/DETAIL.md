# dsh-remember-compact-pls — Details

## Overview

Long-context models can lose attention well before their context window is full. A percentage-of-window meter therefore does not tell you when to compact. This plugin instead measures usage against an **attention budget in k tokens**, which you set directly.

It is a TypeScript DSH plugin bundle with a Host half and a Web Client half. The reminder reads the existing `contextPressure` projection (the same data source as the built-in context ring).

## Behavior

- **Always visible:** the pill shows `{used}k / {budget}k` whenever a session is open and usage is known.
- **Quiet:** below `remindPercent` of the budget, the pill is muted.
- **Warn:** at or above `remindPercent` (default 70%) of the budget, the pill is amber and adds "compact recommended".
- **Urgent:** at or above 100% of the budget (`thresholdK * 1000` tokens), the pill is red and adds "compact now recommended".
- **Click / confirm:** clicking the pill switches it to an inline confirmation. Confirming fills `/compact` into the composer so you can press Enter to run it; Cancel dismisses it. Nothing is sent automatically.
- **Safe click:** below the remind threshold, clicking shows "context length is safe" for a moment instead of the compaction confirmation.

## Settings

Editable in Settings > General, in the plugin's `settings.general.item` row.

| Field | Default | Meaning |
| --- | --- | --- |
| `thresholdK` | 300 | Attention budget in thousands of tokens (300 = 300k). |
| `remindPercent` | 70 | Percentage of the budget at which the pill starts highlighting. |

These are fields of the plugin's own Config and are `.volatile()`, so editing them applies live without restarting the plugin.

## Limitations

- Budget and percentage are stored in the plugin Config (`thresholdK`, `remindPercent`).
- The pill only appears while a session is open and while context usage is known.
- It relies on the `contextPressure` projection being available.

## Non-destructive scope

- Adds one composer-dock entry with the fresh id `remember-compact-pls`; it does not replace the built-in `usage` or `activity` entries.
- Adds one Settings row with a fresh id.
- Does not write session events, modify the system prompt, or override built-in components.
- Disabling or removing the plugin restores the original UI.
