import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return entry.name === 'i18n' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(path) && !/\.test\.|vite-env/.test(path) ? [path] : [];
  });
}

const visibleNames = new Set(['label', 'title', 'description', 'placeholder', 'aria-label', 'alt', 'caption', 'confirmLabel', 'hint', 'message', 'detail', 'text', 'error', 'singular', 'what', 'header', 'addLabel', 'display_name', 'lockReason']);
const technicalAttributes = new Set(['className', 'class', 'id', 'key', 'to', 'href', 'value', 'name', 'type', 'role', 'view', 'data-testid', 'data-pointer', 'accept', 'autoComplete', 'method', 'variant', 'tone', 'size', 'aria-sort', 'aria-live', 'aria-current']);
const technicalCalls = /^(?:cva|cn|querySelector|querySelectorAll|setAttribute|includes|startsWith|endsWith|join|split|replace|replaceAll|match|test|fetch|api|setupRequest|setAt|getAt|deleteAt|localStorage|sessionStorage|addEventListener|removeEventListener)$/;
const words = /[A-Za-zÄÖÜäöüß]/;

export function jsxText(text) {
  const lines = text.split(/\r?\n/);
  let last = 0;
  lines.forEach((line, index) => { if (/\S/.test(line)) last = index; });
  return lines.map((line, index) => {
    let value = line.replace(/\t/g, ' ');
    if (index !== 0) value = value.replace(/^ +/, '');
    if (index !== lines.length - 1) value = value.replace(/ +$/, '');
    return value && index !== last ? value + ' ' : value;
  }).join('');
}

function nearestDeclaration(node) {
  for (let p = node.parent; p; p = p.parent) if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  return '';
}

export function candidates(text, file = 'screen.tsx', jsxOnly = false) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const add = (node, value, kind) => found.push({ start: node.getStart(source), end: node.end, value, kind, node, source, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'uiText', 'codeLabel', 'reasonLabel', 'validationLabel'].includes(node.expression.text)) {
      node.arguments.slice(1).forEach((argument) => visit(argument));
      return;
    }
    if (ts.isJsxText(node)) {
      const value = jsxText(node.getText(source));
      if (value.trim() && words.test(value)) add(node, value, 'jsx');
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const parent = node.parent;
      if (ts.isBinaryExpression(parent) && ![ts.SyntaxKind.PlusToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind)) return;
      if (ts.isConditionalExpression(parent) && parent.condition === node) return;
      let value = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map((span, index) => `{v${index}}` + span.literal.text).join('') : node.text;
      if (!words.test(value)) return;
      if ((value.match(/\b(?:bg-|text-|px-|py-|rounded-|hover:|border-|font-)/g) ?? []).length >= 2) return;
      if (ts.isPropertyAssignment(parent) && parent.name === node) return;
      if (ts.isCaseClause(parent) || ts.isElementAccessExpression(parent) || ts.isImportTypeNode(parent)) return;
      let context = parent;
      while (ts.isConditionalExpression(context) || ts.isParenthesizedExpression(context) || ts.isBinaryExpression(context)) context = context.parent;
      if (ts.isJsxExpression(context)) {
        const jsxParent = context.parent;
        if (ts.isJsxElement(jsxParent) || ts.isJsxFragment(jsxParent)) { add(node, value, 'expression'); return; }
        context = jsxParent;
      }
      if (ts.isJsxAttribute(context)) {
        if (technicalAttributes.has(context.name.getText(source))) return;
        if (visibleNames.has(context.name.getText(source))) { add(node, value, 'attribute'); return; }
      }
      if (jsxOnly) return;
      if (ts.isPropertyAssignment(context)) {
        const name = context.name.getText(source).replace(/['"]/g, '');
        const call = context.parent.parent;
        if (/^v\d+$/.test(name) && ts.isCallExpression(call) && ts.isIdentifier(call.expression) && ['t', 'uiText'].includes(call.expression.text)) { add(node, value, 'interpolation'); return; }
        if (name === 'error' && /^[a-z][a-z0-9]*_[a-z0-9_]+$/.test(value)) return; // response discriminator; translated when displayed
        if (name === 'value' && ts.isObjectLiteralExpression(context.parent) && context.parent.properties.every((p) => ts.isPropertyAssignment(p) && ['label', 'value'].includes(p.name.getText(source))) && context.parent.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText(source) === 'label')) { add(node, value, 'property'); return; }
        if (technicalAttributes.has(name) || ['kind', 'op', 'source_type', 'source_id', 'contract_id', 'binding_id', 'type_id', 'unit', 'reason', 'event', 'state', 'ref', 'target'].includes(name)) return;
        if (visibleNames.has(name) && !['bool', 'number', 'text', 'enum', 'object', 'string'].includes(value)) { add(node, value, 'property'); return; }
      }
      const declaration = nearestDeclaration(node);
      if (/LABELS|NAMES|MESSAGES|START_CASES|PHASES|COMPARISONS|ID_HINT|TEMPORAL_HINTS|TEXT$/.test(declaration) && !ts.isPropertyAssignment(parent) || /LABELS|NAMES|MESSAGES|TEMPORAL_HINTS|TEXT$/.test(declaration) && ts.isPropertyAssignment(parent)) { add(node, value, 'dictionary'); return; }
      for (let p = parent; p && p !== source; p = p.parent) {
        if (ts.isJsxAttribute(p) && technicalAttributes.has(p.name.getText(source))) return;
        if (ts.isCallExpression(p)) {
          const name = ts.isIdentifier(p.expression) ? p.expression.text : ts.isPropertyAccessExpression(p.expression) ? p.expression.name.text : '';
          if (technicalCalls.test(name)) return;
          break;
        }
      }
      // Sentences and German literals outside protocol/schema keys are UI copy.
      if (/[ÄÖÜäöüß]/.test(value) || /[A-Za-z]{2,}\s+(?:[A-Za-zÄÖÜäöüß]{2,}|\{v)/.test(value) || ['Offline', 'Ja', 'Nein', 'unbekannt', 'leer', 'leer (null)', 'keine'].includes(value)) { add(node, value, 'sentence'); return; }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

export function scan(root, jsxOnly = false) {
  return sourceFiles(root).flatMap((file) => candidates(readFileSync(file, 'utf8'), file, jsxOnly).map((finding) => ({ file: relative(root, file).replaceAll('\\', '/'), ...finding })));
}
