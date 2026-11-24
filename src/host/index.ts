/**
 * Host half of dsh-remember-compact-pls.
 *
 * Declares two live preferences as plugin Config so the Settings system projects
 * them into a settings document keyed by this plugin's entry id:
 *   - thresholdK:    the attention budget in *k tokens* (e.g. 300 = 300k).
 *   - remindPercent: the percentage of that budget at which to start reminding.
 * The Client half reads and writes that document and owns all rendering.
 */
import z from '@deepseek-ai/schemastery';

/** Mark a bounded number schema as a live (volatile) preference. */
const live = (schema: unknown): unknown => (schema as { volatile: () => unknown }).volatile();

/** Live preferences, editable from Settings > General without restarting the plugin. */
export const Config = z.object({
  /** Attention budget in thousands of tokens. */
  thresholdK: live(z.number().min(1).max(100000).default(300)),
  /** Percentage of the budget at which the reminder starts highlighting. */
  remindPercent: live(z.number().min(1).max(100).default(70)),
});

/** Minimal shape of the context we rely on, so this file stays dependency-light. */
interface HostContext {
  fiber: unknown;
  inject(names: string[], callback: (child: HostChild) => void): void;
}

interface HostChild {
  effect(setup: () => void): void;
  settings: { configure(presentation: { auto: boolean }, owner: unknown): () => void };
}

/**
 * Register the settings document without an auto-generated page; the Client
 * half renders the controls in a Settings > General row.
 */
export function apply(ctx: HostContext): void {
  ctx.inject(['settings'], (child) => {
    child.effect(() => {
      child.settings.configure({ auto: false }, ctx.fiber);
    });
  });
}
