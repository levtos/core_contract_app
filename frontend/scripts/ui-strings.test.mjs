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
