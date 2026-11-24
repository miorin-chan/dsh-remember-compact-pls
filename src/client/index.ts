/**
 * Client half of dsh-remember-compact-pls.
 *
 * Two additive surfaces:
 *  - a pill in the composer dock that is *always visible* while a session is
 *    open, showing current context usage against an attention budget in k
 *    tokens. It highlights at remindPercent of the budget, turns red at/past
 *    the budget, and on click offers an inline confirm that fills the
 *    `/compact` command into the composer (the user presses Enter to run it);
 *  - a Settings > General row that edits the budget (k tokens) and the remind
 *    percentage, persisted through the plugin's own Config document.
 *
 * Nothing here writes session events, edits the system prompt, or replaces a
 * built-in component: it only adds a fresh dock entry and a fresh settings row.
 */
import {
  createElement,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ChangeEvent } from 'react';

/** Profile entry id / settings namespace; must match cordis.patch.yml. */
const ENTRY_ID = 'dsh-remember-compact-pls';
/** Slash command that performs an explicit context compaction. */
const COMPACT_COMMAND = '/compact';
/** Budget in k tokens until the settings document reports a stored value. */
const DEFAULT_THRESHOLD_K = 300;
/** Percentage of the budget at which the reminder highlights, until stored. */
const DEFAULT_REMIND_PERCENT = 70;

/** Locale dictionary for the pill copy and the settings row. */
const COPY: Record<string, Record<string, string>> = {
  zh: {
    suggest: '建议压缩',
    suggestUrgent: '建议尽快压缩',
    confirmQuestion: '现在压缩上下文？',
    actionCompact: '压缩',
    actionCancel: '取消',
    safeMessage: '上下文长度安全',
    title: '上下文压缩提醒',
    description: '始终显示在输入框下方：当前用量 / 注意力预算（k tokens）。达到提醒比例后高亮，超过预算后标红并建议压缩。',
    thresholdLabel: '预算（k tokens）',
    percentLabel: '提醒比例',
  },
  en: {
    suggest: 'compact recommended',
    suggestUrgent: 'compact now recommended',
    confirmQuestion: 'Compact the context now?',
    actionCompact: 'Compact',
    actionCancel: 'Cancel',
    safeMessage: 'Context length is safe',
    title: 'Context compaction reminder',
    description: 'Always shown under the composer: current usage / attention budget (k tokens). Highlights at the remind percentage and turns red past the budget.',
    thresholdLabel: 'Budget (k tokens)',
    percentLabel: 'Remind at',
  },
};

const CSS = `
.dsh-rcp-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: inherit; font-size: 12px; line-height: 20px;
  padding: 0 9px;
  height: 22px;
  box-sizing: border-box;
  border-radius: var(--dsw-radius-sm);
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  border-bottom-left-radius: 6px;
  border: 0.5px solid transparent;
  background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; user-select: none; white-space: nowrap;
  font-variant-numeric: tabular-nums;
  order: 9999;
  margin-left: auto;
  flex: none;
}
.dsh-rcp-pill:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rcp-pill:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-label-secondary));
  outline-offset: 2px;
}
.dsh-rcp-pill-quiet { color: var(--dsw-alias-label-tertiary); }
.dsh-rcp-pill-warn {
  color: var(--dsw-alias-state-warn-primary);
  border-color: var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-bg-module-platform);
}
.dsh-rcp-pill-danger {
  color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
}
.dsh-rcp-note {
  display: inline-flex; align-items: center;
  font-size: 12px; line-height: 20px; white-space: nowrap;
  color: var(--dsw-alias-state-success-primary);
  order: 9999;
  margin-left: auto;
}
.dsh-rcp-confirm {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary);
  order: 9999;
  margin-left: auto;
}
.dsh-rcp-confirm-text { white-space: nowrap; }
.dsh-rcp-btn {
  font: inherit; font-size: 12px; line-height: 20px; padding: 0 10px; height: 24px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary); cursor: pointer;
}
.dsh-rcp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rcp-btn:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-label-secondary));
  outline-offset: 2px;
}
.dsh-rcp-btn-primary {
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}
.dsh-rcp-row {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-rcp-row-text {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 4px; padding-right: 48px;
}
.dsh-rcp-row-title { font-size: 14px; font-weight: 400; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dsh-rcp-row-description { font-size: 12px; font-weight: 400; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-rcp-fields { display: flex; align-items: center; gap: 16px; flex: none; }
.dsh-rcp-field { display: inline-flex; align-items: center; gap: 6px; }
.dsh-rcp-field-label { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dsh-rcp-input-wrap {
  display: inline-flex; align-items: center; gap: 2px; height: 30px; padding: 0 8px;
  border-radius: var(--dsw-radius-sm, 6px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-module-platform);
}
.dsh-rcp-input {
  width: 64px; border: none; background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; text-align: right; outline: none; font-variant-numeric: tabular-nums;
}
.dsh-rcp-suffix { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
@media (max-width: 767px) {
  html:not([data-windows-titlebar]):not([data-platform='darwin']) .dsh-rcp-row-text { padding-right: 16px; }
}
`;

interface ContextPressure {
  projectedTokens?: number;
  pressureTokens?: number;
  contextWindow?: number;
}

interface UseProjection {
  <K extends string = string>(key: K): ContextPressure | undefined;
  <K extends string = string, S = unknown>(
    key: K,
    selector: (value: ContextPressure | undefined) => S,
    equal?: (a: S, b: S) => boolean,
  ): S;
}

interface InputActions {
  setDraft?: (text: string) => void;
}

interface FormSnapshot {
  value?: { thresholdK?: number; remindPercent?: number };
}

interface FormLike {
  getSnapshot(): FormSnapshot;
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<unknown>;
}

interface ThresholdFace {
  subscribe: (listener: () => void) => () => void;
  getThresholdK: () => number;
  getRemindPercent: () => number;
}

interface PillProps extends ThresholdFace {
  useProjection?: UseProjection;
  inputActions?: InputActions;
  t?: (key: string) => string;
}

interface RowProps extends ThresholdFace {
  setField: (field: string, value: number) => void;
  t?: (key: string) => string;
}

interface ClientSlots {
  inject(owner: string, register: () => unknown): unknown;
  register(options: Record<string, unknown>, component: unknown): unknown;
}

interface ClientContext {
  slots: ClientSlots;
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void;
  };
  configForms: { get(namespace: string): FormLike };
  effect(setup: () => (() => void) | void, label?: string): void;
}

function tr(t: ((key: string) => string) | undefined, key: string): string {
  const value = t?.(key);
  if (typeof value === 'string' && value !== key) return value;
  return COPY.en[key] ?? key;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Fill `/compact` into the composer draft so the user can review and press Enter. */
function fillCompactDraft(inputActions: InputActions | undefined): void {
  inputActions?.setDraft?.(COMPACT_COMMAND);
}

/** Always-visible composer-dock pill: current usage vs the attention budget. */
function CompactPill({ useProjection, inputActions, subscribe, getThresholdK, getRemindPercent, t }: PillProps) {
  const thresholdK = useSyncExternalStore(subscribe, getThresholdK);
  const remindPercent = useSyncExternalStore(subscribe, getRemindPercent);
  const [confirming, setConfirming] = useState(false);
  const [safeNotice, setSafeNotice] = useState(false);

  useEffect(() => {
    if (!safeNotice) return undefined;
    const id = setTimeout(() => setSafeNotice(false), 2000);
    return () => clearTimeout(id);
  }, [safeNotice]);

  const used = useProjection?.('contextPressure', (p) => p?.projectedTokens ?? p?.pressureTokens);
  if (used === undefined) return null;

  const budgetK = Math.max(1, Math.round(thresholdK));
  const usedK = Math.max(0, Math.round(used / 1000));
  const ratio = used / (budgetK * 1000);
  const percentOfBudget = Math.round(ratio * 100);
  const danger = ratio >= 1;
  const warn = ratio >= Math.max(1, Math.min(100, remindPercent)) / 100;
  const state = danger ? 'danger' : warn ? 'warn' : 'quiet';
  const suffix = danger ? tr(t, 'suggestUrgent') : warn ? tr(t, 'suggest') : '';
  const label = `${usedK}k / ${budgetK}k`;
  const aria = `${label} · ${percentOfBudget}%${suffix === '' ? '' : ` · ${suffix}`}`;

  if (safeNotice) {
    return createElement(
      'span',
      {
        className: 'dsh-rcp-note',
        role: 'status',
        'aria-live': 'polite',
        'aria-label': tr(t, 'safeMessage'),
      },
      tr(t, 'safeMessage'),
    );
  }

  if (confirming) {
    return createElement(
      'span',
      {
        className: 'dsh-rcp-confirm',
        role: 'group',
        'aria-label': tr(t, 'confirmQuestion'),
      },
      createElement('span', { className: 'dsh-rcp-confirm-text' }, tr(t, 'confirmQuestion')),
      createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-rcp-btn dsh-rcp-btn-primary',
          'aria-label': tr(t, 'actionCompact'),
          onClick: () => {
            setConfirming(false);
            fillCompactDraft(inputActions);
          },
        },
        tr(t, 'actionCompact'),
      ),
      createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-rcp-btn',
          'aria-label': tr(t, 'actionCancel'),
          onClick: () => setConfirming(false),
        },
        tr(t, 'actionCancel'),
      ),
    );
  }

  return createElement(
    'button',
    {
      type: 'button',
      className: `dsh-rcp-pill dsh-rcp-pill-${state}`,
      title: aria,
      'aria-label': aria,
      onClick: () => {
        if (warn) setConfirming(true);
        else setSafeNotice(true);
      },
    },
    createElement('span', { 'aria-hidden': true }, '\u26A0'),
    createElement('span', null, suffix === '' ? label : `${label} · ${suffix}`),
  );
}

/** Settings > General row: attention budget (k tokens) and remind percentage. */
function SettingsRow({ subscribe, getThresholdK, getRemindPercent, setField, t }: RowProps) {
  const thresholdK = useSyncExternalStore(subscribe, getThresholdK);
  const remindPercent = useSyncExternalStore(subscribe, getRemindPercent);

  const budgetField = createElement(
    'label',
    { className: 'dsh-rcp-field' },
    createElement('span', { className: 'dsh-rcp-field-label' }, tr(t, 'thresholdLabel')),
    createElement(
      'span',
      { className: 'dsh-rcp-input-wrap' },
      createElement('input', {
        type: 'number',
        className: 'dsh-rcp-input',
        min: 1,
        max: 100000,
        step: 10,
        value: String(thresholdK),
        'aria-label': tr(t, 'thresholdLabel'),
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(parsed)) setField('thresholdK', clampInt(parsed, 1, 100000, thresholdK));
        },
      }),
      createElement('span', { className: 'dsh-rcp-suffix', 'aria-hidden': true }, 'k'),
    ),
  );

  const percentField = createElement(
    'label',
    { className: 'dsh-rcp-field' },
    createElement('span', { className: 'dsh-rcp-field-label' }, tr(t, 'percentLabel')),
    createElement(
      'span',
      { className: 'dsh-rcp-input-wrap' },
      createElement('input', {
        type: 'number',
        className: 'dsh-rcp-input',
        min: 1,
        max: 100,
        step: 1,
        value: String(remindPercent),
        'aria-label': tr(t, 'percentLabel'),
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(parsed)) setField('remindPercent', clampInt(parsed, 1, 100, remindPercent));
        },
      }),
      createElement('span', { className: 'dsh-rcp-suffix', 'aria-hidden': true }, '%'),
    ),
  );

  return createElement(
    'div',
    { className: 'dsh-rcp-row' },
    createElement(
      'div',
      { className: 'dsh-rcp-row-text' },
      createElement('div', { className: 'dsh-rcp-row-title' }, tr(t, 'title')),
      createElement('div', { className: 'dsh-rcp-row-description' }, tr(t, 'description')),
    ),
    createElement('div', { className: 'dsh-rcp-fields' }, budgetField, percentField),
  );
}

export const inject = ['slots', 'locale', 'configForms'];

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(ENTRY_ID, COPY), 'dsh-remember-compact-pls: locale');

  const form = ctx.configForms.get(ENTRY_ID);
  const subscribe = (listener: () => void): (() => void) => form.subscribe(listener);
  const getThresholdK = (): number => {
    const value = form.getSnapshot().value?.thresholdK;
    return typeof value === 'number' ? value : DEFAULT_THRESHOLD_K;
  };
  const getRemindPercent = (): number => {
    const value = form.getSnapshot().value?.remindPercent;
    return typeof value === 'number' ? value : DEFAULT_REMIND_PERCENT;
  };
  const setField = (field: string, value: number): void => {
    void form.set(field, value);
  };

  ctx.effect(() => {
    const tag = document.createElement('style');
    tag.dataset.plugin = ENTRY_ID;
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, 'dsh-remember-compact-pls: styles');

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'remember-compact-pls',
    order: 2,
    locale: ENTRY_ID,
    inject: () => ({ subscribe, getThresholdK, getRemindPercent }),
  }, CompactPill));

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'remember-compact-pls',
    order: 21,
    locale: ENTRY_ID,
    inject: () => ({ subscribe, getThresholdK, getRemindPercent, setField }),
  }, SettingsRow));
}
