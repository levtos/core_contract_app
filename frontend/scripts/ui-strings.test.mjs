import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { candidates } from './ui-strings.mjs';

test('lint rejects JSX copy, accessible labels and branch labels', () => {
  const findings = candidates('const C = ({ok}) => <div><button title="Speichern">Hallo</button><p>{ok ? "bereit" : "nicht bereit"}</p></div>;', 'screen.tsx', true);
  assert.deepEqual(findings.map((finding) => finding.value), ['Speichern', 'Hallo', 'bereit', 'nicht bereit']);
});
test('scan finds copy in display dictionaries and interpolation arguments', () => {
  assert.equal(candidates('const LABELS = { good: "bereit" }; const C = () => <p>{uiText("key", { x: "Bitte speichern" })}</p>;', 'screen.tsx').length, 2);
});
test('protocol values, types, CSS and translated copy are excluded', () => {
  const text = 'import { t as uiText } from "@/i18n"; type T = "Hallo Welt"; const C = ({value}) => <input type="text" value="source.a" className="flex text-sm" title={uiText("key")} aria-invalid={typeof value === "string"} />;';
  assert.deepEqual(candidates(text, 'screen.tsx'), []);
  assert.deepEqual(candidates('const response = {error: "invalid_response"};', 'api.ts'), []);
});

test('visible values are scanned while tab and option identities stay stable', () => {
  assert.deepEqual(candidates('const items = [{label: t("key"), value: "keine"}]; const tabs = [{label: t("key"), value: "state", content: <C />}]; const options = [{label: t("key"), value: "active", hint: t("hint")}];', 'screen.tsx').map(f => f.value), ['keine']);
});

test('single words in visible interpolation branches are scanned', () => {
  const text = 'const message = uiText("key", { v0: (result.mode === "off" ? "angeboten" : codeLabel("unknown")) });';
  assert.deepEqual(candidates(text, 'screen.tsx').map(f => f.value), ['angeboten']);
});

test('label-map object values are visible even with protocol-like property names', () => {
  const text = `
    const OP_LABELS: Record<string, string> = {
      ref: 'Interne Regel (Verweis)', name: 'Name', value: 'Wert',
      kind: 'Art', type: 'Typ', 'source_id': 'Quelle',
    };
    const displayLabels = { group: { state: 'Zustand' } } as const;
    const statusNames = { ref: 'Verweis', title: t('title') } satisfies Record<string, string>;
  `;
  assert.deepEqual(candidates(text, 'screen.tsx').map(f => f.value), [
    'Interne Regel (Verweis)', 'Name', 'Wert', 'Art', 'Typ', 'Quelle', 'Zustand', 'Verweis',
  ]);
});

test('ordinary protocol objects keep their identifiers outside label maps', () => {
  const text = `const config = { ref: 'source.a', name: 'a', value: 'on', kind: 'ha_state', type: 'bool', state: 'idle' };`;
  assert.deepEqual(candidates(text, 'registry.ts'), []);
});

test('nested label arrays and visible default arguments cannot bypass the scanner', () => {
  const text = `function Editor({ addLabel = 'Eingang' }) { return <List labels={two ? ['Aktuell', 'Vergleich'] : ['Eingang']} />; }`;
  assert.deepEqual(candidates(text, 'screen.tsx').map(f => f.value), ['Eingang', 'Aktuell', 'Vergleich', 'Eingang']);
  assert.deepEqual(candidates(`const config = {args: ['input', 'ref']}; const C = () => <List labels={[t('current'), t('comparison')]} />`, 'screen.tsx'), []);
});
