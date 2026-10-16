import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { FieldStatusBadge } from '@/components/status-parts';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { RuleEditor, RuleEnvProvider } from '@/editors/RuleEditor';
import { newDefinition, ruleContext } from '@/features/authoring/model';
import { caps, Stateful, wrap } from '../../test/harness';

type RGB = [number, number, number];
const css = readFileSync('src/index.css', 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6});/g)].map(match => [match[1], match[2]!])) as Record<string, string>;
const rgb = (hex: string): RGB => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as RGB;
const blend = (foreground: RGB, background: RGB, opacity: number) => foreground.map((value, index) => value * opacity + background[index]! * (1 - opacity)) as RGB;
const luminance = (color: RGB) => color.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
const contrast = (a: RGB, b: RGB) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

it('meets WCAG AA for small status-chip text on all used surfaces and the primary button including hover', () => {
  for (const background of ['canvas', 'panel', 'raised', 'sunken']) {
    for (const tone of ['ok', 'warn', 'bad', 'info']) {
      const foreground = rgb(tokens[tone]!);
      expect(contrast(foreground, blend(foreground, rgb(tokens[background]!), 0.1)), `${tone} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const label of ['fg', 'muted', 'faint']) expect(contrast(rgb(tokens[label]!), rgb(tokens[background]!)), `${label} on ${background}`).toBeGreaterThanOrEqual(4.5);
  }
  for (const background of ['accent', 'accent-strong']) expect(contrast(rgb(tokens['accent-fg']!), rgb(tokens[background]!))).toBeGreaterThanOrEqual(4.5);
});

it('shows unknown in gray and never interprets its null as Nein', () => {
  const view = render(<FieldStatusBadge field={{ status: 'unknown', value: null, quality: 'degraded', reasons: [], evidence: [] }} />);
  expect(screen.getByText('unbekannt')).toHaveClass('text-muted');
  expect(view.container.querySelector('[class*="text-warn"]')).toBeNull();
  expect(screen.queryByText('Nein')).toBeNull();
});

it('keeps warnings visible without a yellow page box and explains a disabled action in visible text', async () => {
  const click = vi.fn();
  const view = render(<><Notice tone="warn" title="Daten fehlen">Wähle zuerst ein Gerät.</Notice><Button disabled disabledReason="Wähle zuerst ein Gerät." onClick={click}>Anlegen</Button></>);
  expect(view.container.querySelector('[class*="bg-warn"]')).toBeNull();
  const button = screen.getByRole('button', { name: 'Anlegen' });
  expect(button).toHaveAccessibleDescription('Wähle zuerst ein Gerät.');
  await userEvent.click(button); expect(click).not.toHaveBeenCalled();
  expect(screen.getAllByText('Wähle zuerst ein Gerät.').every(item => item.getAttribute('hidden') === null)).toBe(true);
});

it('translates visible comparison names while preserving exact engine discriminator values', async () => {
  const user = userEvent.setup(); let current: unknown;
  const initial = { op: 'compare', comparison: 'eq', left: { op: 'literal', schema: { type: 'number', required: true, physical_state: false }, value: 1 }, right: { op: 'literal', schema: { type: 'number', required: true, physical_state: false }, value: 2 } };
  const view = wrap(<RuleEnvProvider value={{ ctx: ruleContext(newDefinition('test.x', 1), false), caps, locked: false }}><Stateful initial={initial} onValue={value => { current = value; }}>{(value, set) => <RuleEditor value={value as typeof initial} onChange={set} pointer="/outputs/value" />}</Stateful></RuleEnvProvider>);
  const picker = screen.getByLabelText('Vergleich');
  expect(Array.from(picker.querySelectorAll('option')).map(option => option.textContent)).not.toContain('eq');
  await user.selectOptions(picker, 'gt'); expect(current).toMatchObject({ comparison: 'gt' });
  expect(view.container.querySelector('[class*="border-l-ok"], [class*="border-l-warn"], [class*="border-l-info"]')).toBeNull();
});

it('shows actionable field errors without raw validation codes', () => {
  render(<Field label="Name" errors={[{ code: 'schema.pattern', message: 'Der Name darf keinen Punkt am Ende haben.' }]}>{props => <Input {...props} />}</Field>);
  expect(screen.getByRole('alert')).toHaveTextContent('Der Name darf keinen Punkt am Ende haben.');
  expect(screen.queryByText('schema.pattern')).toBeNull();
});
