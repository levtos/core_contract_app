import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { ReadinessBadge } from '@/components/ReadinessBadge';
import { classifySystem, type Condition } from '@/lib/status';
import type { ServiceState } from '@/lib/types';

const service: ServiceState = { ready: true, publication_confirmed: true, persistence: 'available', ha: 'not_needed', bridge: 'not_needed', mqtt: 'disabled', reasons: [] };
const condition: Condition = { kind: 'limited_source', tone: 'warn', title: 'technical title', detail: 'raw code' };
const mount = (conditions: Condition[], ready = false) => render(<MemoryRouter><ReadinessBadge conditions={conditions} ready={ready} revision={4} /><button>Außerhalb</button></MemoryRouter>);

it('shows ready without a false HA warning and keeps the configuration version visible', async () => {
  const conditions = classifySystem({ service, connection: 'open', hasActiveRegistry: true });
  expect(conditions).toEqual([]);
  mount(conditions, true);
  expect(screen.getByRole('button', { name: 'Bereit' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('Version 4')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Bereit' }));
  expect(within(screen.getByRole('dialog')).getByText('Alle Bedingungen sind erfüllt.')).toBeVisible();
});

it('counts each condition and exposes an actionable sentence and direct route on click', async () => {
  const user = userEvent.setup();
  mount([condition, { ...condition, kind: 'persistence_failure' }]);
  const trigger = screen.getByRole('button', { name: 'Nicht bereit · 2' });
  await user.click(trigger);
  const window = screen.getByRole('dialog', { name: 'Offene Bedingungen' });
  expect(within(window).getByText('Terra erreicht die Datenbank nicht.')).toBeVisible();
  expect(within(window).getAllByRole('link', { name: 'Verbindung prüfen' })).toHaveLength(2);
  expect(within(window).getAllByRole('link')[0]).toHaveAttribute('href', '/settings/connections');
  expect(window).not.toHaveTextContent('raw code');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('supports temporary hover, pinned click and dismissal outside', async () => {
  const user = userEvent.setup();
  mount([condition]);
  const trigger = screen.getByRole('button', { name: 'Nicht bereit · 1' });
  await user.hover(trigger);
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.unhover(trigger);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(trigger);
  await user.unhover(trigger);
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Außerhalb' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('does not invent an HA problem while the browser is still connecting', async () => {
  mount([]);
  await userEvent.click(screen.getByRole('button', { name: 'Nicht bereit · 1' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Die Verbindung wird geprüft.');
  expect(screen.getByRole('dialog')).not.toHaveTextContent('HA-Anbindung');
});
