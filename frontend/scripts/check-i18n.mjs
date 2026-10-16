import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { scan, sourceFiles } from './ui-strings.mjs';

const jsxOnly = process.argv.includes('--jsx-only');
const findings = scan(resolve('src'), jsxOnly);
const dictionary = JSON.parse(readFileSync('src/i18n/de.json', 'utf8'));
const missing = [];
for (const file of [...sourceFiles(resolve('src')), resolve('src/i18n/codes.ts')]) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'uiText'].includes(node.expression.text) && ts.isStringLiteral(node.arguments[0]) && !(node.arguments[0].text in dictionary)) missing.push(`${file}: fehlender Schlüssel ${node.arguments[0].text}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const finding of findings) console.error(`${finding.file}:${finding.line}: harter Oberflächentext: ${finding.value}`);
console.log(`${jsxOnly ? 'JSX-Lint' : 'i18n-Scan'}: ${findings.length} harte Oberflächentexte`);
missing.forEach((message) => console.error(message));
process.exitCode = findings.length || missing.length ? 1 : 0;
