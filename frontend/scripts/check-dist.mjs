// Static checks of the production build against the Ingress/CSP delivery model:
// default-src 'self', no inline script, relative base path, no external runtime
// dependencies, and asset names the server may cache as immutable.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const problems = [];
const html = readFileSync(join(dist, 'index.html'), 'utf8');

for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/\bsrc="\.\/assets\//.test(match[1]) || match[2].trim()) problems.push(`inline or non-relative script: ${match[0].slice(0, 80)}`);
}
for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  if (!match[1].startsWith('./assets/')) problems.push(`non-relative or external reference in index.html: ${match[1]}`);
}
if (/\son\w+="/.test(html)) problems.push('inline event handler in index.html');
if (/<style\b/.test(html)) problems.push('inline <style> block in index.html');

const versioned = /-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2|svg|png)$/;
const external = /(?:https?:)?\/\/(?:fonts\.(?:googleapis|gstatic)\.com|cdn\.|unpkg\.com|cdnjs\.|cdn\.jsdelivr\.net)/;
for (const name of readdirSync(join(dist, 'assets'))) {
  if (!versioned.test(name)) problems.push(`asset without content hash (would not be immutable-cached): ${name}`);
  if (/\.(css|js)$/.test(name)) {
    const text = readFileSync(join(dist, 'assets', name), 'utf8');
    if (external.test(text)) problems.push(`external runtime dependency referenced in ${name}`);
    if (name.endsWith('.css')) {
      if (/url\(\s*["']?data:/.test(text)) problems.push(`data: URI in ${name} (blocked by default-src 'self')`);
      if (/@import\s+url\(\s*["']?https?:/.test(text)) problems.push(`remote @import in ${name}`);
      if (/url\(\s*["']?\//.test(text)) problems.push(`absolute url() in ${name} (breaks below an Ingress prefix)`);
    }
  }
}
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('dist ok: relative, hashed, no inline script, no external dependencies');
