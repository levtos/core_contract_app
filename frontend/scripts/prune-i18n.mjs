/** Remove only provably unreferenced German keys; dynamic enum namespaces stay. */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sourceFiles } from './ui-strings.mjs';

const dictionaryFile = resolve('src/i18n/de.json');
const dictionary = JSON.parse(readFileSync(dictionaryFile, 'utf8'));
const exact = new Set();
const prefixes = new Set();
for (const file of [...sourceFiles(resolve('src')), resolve('src/i18n/codes.ts')]) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      exact.add(node.text);
      if (/^[a-z][\w.]*\.$/i.test(node.text)) prefixes.add(node.text);
    }
    if (ts.isTemplateExpression(node) && /^[a-z][\w.]*\.$/i.test(node.head.text)) prefixes.add(node.head.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const unused = Object.keys(dictionary).filter(key => !exact.has(key) && ![...prefixes].some(prefix => key.startsWith(prefix)));
console.log(JSON.stringify({ unusedCount: unused.length, unused, dynamicNamespaces: [...prefixes].sort() }, null, 2));
if (process.argv.includes('--prune')) {
  for (const key of unused) delete dictionary[key];
  writeFileSync(dictionaryFile, JSON.stringify(dictionary, null, 2) + '\n');
}
