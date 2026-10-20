import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const css = readFileSync(new URL('../../frontend/src/app/globals.css', import.meta.url), 'utf8');
const workspace = readFileSync(
  new URL('../../frontend/src/components/service-orders/service-orders-workspace.tsx', import.meta.url),
  'utf8',
);

describe('OS items horizontal scroll', () => {
  it('scrolls inside the items grid and keeps the page from moving sideways', () => {
    assert.match(css, /\.os-items-section \.data-table-wrapper \{[^}]*overflow-x:\s*auto/s);
    assert.match(css, /\.os-items-table \.data-table \{[^}]*width:\s*max-content/s);
    assert.match(css, /html,\s*body \{[^}]*overflow-x:\s*hidden/s);
    assert.match(css, /\.workspace__content \{[^}]*overflow-x:\s*hidden/s);
    assert.doesNotMatch(css, /\.os-items-section \.data-table-wrapper \{[^}]*overflow:\s*visible/s);
  });

  it('keeps a minimum width for Tempo, Valor, Desconto, Subtotal and Ações', () => {
    assert.match(css, /nth-child\(8\)[\s\S]*min-width:\s*96px/);
    assert.match(css, /nth-child\(9\)[\s\S]*nth-child\(10\)[\s\S]*min-width:\s*132px/);
    assert.match(css, /nth-child\(11\)[\s\S]*min-width:\s*110px/);
    assert.match(css, /nth-child\(12\)[\s\S]*min-width:\s*180px/);
  });

  it('covers every current column in the empty grade row', () => {
    assert.match(workspace, /<th>Ações<\/th>/);
    assert.match(workspace, /Tempo \(min\)/);
    assert.match(workspace, /colSpan=\{12\}/);
    assert.match(workspace, /scrollFieldIntoOsGrid/);
  });
});
