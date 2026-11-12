import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptySidebarFavorites,
  createEmptySidebarTree,
  normalizeSidebarFavorites,
  normalizeSidebarTree,
  SIDEBAR_COLLAPSED_STORAGE_PREFIX,
  SIDEBAR_FAVORITES_STORAGE_PREFIX,
  SIDEBAR_TREE_STORAGE_KEY,
  sidebarCollapsedStorageKey,
  sidebarFavoritesStorageKey,
  toggleTreeId,
} from '../../frontend/src/components/app-shell/sidebar-tree';

test('toggles sidebar tree ids without duplicates', () => {
  assert.deepEqual(toggleTreeId([], 'Cadastros'), ['Cadastros']);
  assert.deepEqual(toggleTreeId(['Cadastros'], 'Cadastros'), []);
  assert.deepEqual(toggleTreeId(['Cadastros'], '/customers'), ['Cadastros', '/customers']);
});

test('normalizes empty and duplicate collapsed tree ids', () => {
  assert.deepEqual(normalizeSidebarTree({ collapsedSections: ['', 'Cadastros', 'Cadastros'], collapsedItems: ['  '] }), {
    collapsedSections: ['Cadastros'],
    collapsedItems: [],
  });
  assert.equal(SIDEBAR_TREE_STORAGE_KEY, 'anexsys.frontend.sidebar-tree.v1');
  assert.deepEqual(createEmptySidebarTree(), { collapsedSections: [], collapsedItems: [] });
});

test('scopes and normalizes sidebar favorites per user', () => {
  assert.equal(sidebarFavoritesStorageKey('user-123'), `${SIDEBAR_FAVORITES_STORAGE_PREFIX}.user-123`);
  assert.equal(sidebarFavoritesStorageKey(null), SIDEBAR_FAVORITES_STORAGE_PREFIX);
  assert.deepEqual(normalizeSidebarFavorites([' /service-orders ', '', '/customers', '/service-orders']), [
    '/service-orders',
    '/customers',
  ]);
  assert.deepEqual(createEmptySidebarFavorites(), []);
  assert.equal(sidebarCollapsedStorageKey('user-123'), `${SIDEBAR_COLLAPSED_STORAGE_PREFIX}.user-123`);
  assert.equal(sidebarCollapsedStorageKey(null), SIDEBAR_COLLAPSED_STORAGE_PREFIX);
});
