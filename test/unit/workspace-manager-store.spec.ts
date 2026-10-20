import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activateWorkspaceTab,
  buildWorkspaceHref,
  clearWorkspaceScopedState,
  cloneWorkspaceTabState,
  collapseDuplicateDashboardTabs,
  HOME_WORKSPACE_PATH,
  createEmptyWorkspaceStore,
  createWorkspaceTab,
  findWorkspaceTabByBasePath,
  getWorkspaceBasePath,
  getWorkspaceScopedState,
  getWorkspaceSearchParams,
  isDashboardWorkspacePath,
  isWorkspaceListPath,
  listWorkspaceTabsForNavItem,
  moveWorkspaceTabToFront,
  normalizeWorkspacePathname,
  normalizeWorkspaceStore,
  removeWorkspaceTab,
  resolveLandingWorkspaceTab,
  stripHomeWorkspaceTabs,
  revealWorkspaceTab,
  setActiveWorkspaceTab,
  setWorkspaceScopedState,
  shouldShowWorkspaceNavSubmenu,
  upsertWorkspaceTab,
} from '../../frontend/src/components/app-shell/workspace-manager-store';
import { WORKSPACE_STORAGE_KEY } from '../../frontend/src/components/app-shell/workspace-storage';

test('activates a workspace tab independently of the current route', () => {
  let store = createEmptyWorkspaceStore();
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-dashboard', pathname: HOME_WORKSPACE_PATH, label: 'Dashboard' }));
  store = activateWorkspaceTab(store, createWorkspaceTab({ id: 'tab-contas', pathname: '/admin/tenants', label: 'Contas' }));

  assert.equal(store.activeTabId, 'tab-contas');
  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['tab-contas'],
  );

  store = setActiveWorkspaceTab(store, null);
  assert.equal(store.activeTabId, null);

  store = normalizeWorkspaceStore({
    tabs: store.tabs,
    activeTabId: null,
    stateByTabId: store.stateByTabId,
  });
  assert.equal(store.activeTabId, null);
  assert.deepEqual(store.tabs.map((tab) => tab.id), ['tab-contas']);
});

test('creates, updates, clones, and removes workspace tabs', () => {
  let store = createEmptyWorkspaceStore();
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-1', pathname: '/customers', label: 'Clientes' }));
  store = setWorkspaceScopedState(store, 'tab-1', 'customers.searchQuery', 'maria');
  store = cloneWorkspaceTabState(store, 'tab-1', 'tab-2');
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-2', pathname: '/customers?focusCustomerId=maria', label: 'Cliente · Maria' }));

  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['tab-2', 'tab-1'],
  );
  assert.equal(store.tabs.length, 2);
  assert.equal(getWorkspaceScopedState<string>(store, 'tab-2', 'customers.searchQuery'), 'maria');

  store = clearWorkspaceScopedState(store, 'tab-2', 'customers.searchQuery');
  assert.equal(getWorkspaceScopedState<string>(store, 'tab-2', 'customers.searchQuery'), null);

  store = removeWorkspaceTab(store, 'tab-1');
  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['tab-2'],
  );
});

test('builds href with workspace query param', () => {
  assert.equal(buildWorkspaceHref('/service-orders', 'tab-10'), '/service-orders?workspaceTab=tab-10');
  assert.equal(buildWorkspaceHref('/customers?mode=detail', 'tab-11'), '/customers?mode=detail&workspaceTab=tab-11');
});

test('normalizes workspace pathnames and strips workspace query state', () => {
  assert.equal(normalizeWorkspacePathname('/dashboard?workspaceTab=tab-1'), '/dashboard');
  assert.equal(
    normalizeWorkspacePathname('/customers?workspaceMode=new&workspaceTab=tab-2'),
    '/customers?workspaceMode=new',
  );
  assert.equal(
    createWorkspaceTab({ id: 'tab-3', pathname: '/service-orders?focusServiceOrderId=15&workspaceTab=tab-9', label: 'OS #15' }).pathname,
    '/service-orders?focusServiceOrderId=15',
  );
});

test('reads workspace base path and tab-owned search params', () => {
  assert.equal(getWorkspaceBasePath('/admin/tenants?workspaceTab=tab-1'), '/admin/tenants');
  assert.equal(getWorkspaceBasePath('/customers?workspaceMode=new&focusCustomerId=9'), '/customers');
  assert.equal(getWorkspaceSearchParams('/customers?workspaceMode=new&workspaceTab=tab-2').get('workspaceMode'), 'new');
  assert.equal(getWorkspaceSearchParams('/admin/companies').get('workspaceMode'), null);
});

test('ignores unnamed or empty workspace tabs', () => {
  let store = createEmptyWorkspaceStore();

  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-1', pathname: '/customers', label: 'Customers' }));
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-2', pathname: '/customers', label: '   ' }));
  store = normalizeWorkspaceStore({
    tabs: [...store.tabs, { id: 'tab-3', pathname: '', label: 'Dashboard', subtitle: null }],
    activeTabId: 'tab-1',
    stateByTabId: {
      'tab-1': { valid: true },
      'tab-2': { invalid: true },
      'tab-3': { invalid: true },
    },
  });

  assert.deepEqual(store.tabs.map((tab) => tab.id), ['tab-1']);
  assert.deepEqual(Object.keys(store.stateByTabId), ['tab-1']);
});

test('keeps one list tab per screen and still allows an open record', () => {
  const store = normalizeWorkspaceStore({
    tabs: [
      createWorkspaceTab({ id: 'access-a', pathname: '/admin/access', label: 'Usuários e Acessos' }),
      createWorkspaceTab({ id: 'access-b', pathname: '/admin/access?accessTab=roles', label: 'Usuários e Acessos' }),
      createWorkspaceTab({ id: 'access-user', pathname: '/admin/access?focusUserId=1', label: 'Usuário: Ana' }),
      createWorkspaceTab({ id: 'os-list', pathname: '/service-orders', label: 'Ordens de serviço' }),
      createWorkspaceTab({ id: 'os-new', pathname: '/service-orders?workspaceMode=new', label: 'OS: Nova' }),
    ],
    activeTabId: 'access-b',
    stateByTabId: {
      'access-a': { stale: true },
      'access-b': { keep: true },
      'access-user': { form: true },
      'os-list': { list: true },
      'os-new': { draft: true },
    },
  });

  assert.equal(isWorkspaceListPath('/admin/access?accessTab=roles'), true);
  assert.equal(isWorkspaceListPath('/admin/access?focusUserId=1'), false);
  assert.deepEqual(store.tabs.map((tab) => tab.id), ['access-b', 'access-user', 'os-list', 'os-new']);
  assert.equal(store.activeTabId, 'access-b');
  assert.equal('access-a' in store.stateByTabId, false);
  assert.equal(getWorkspaceScopedState(store, 'access-user', 'form'), true);
});

test('skips rewriting scoped state when the value did not change', () => {
  let store = createEmptyWorkspaceStore();
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-1', pathname: '/customers', label: 'Clientes' }));
  store = setWorkspaceScopedState(store, 'tab-1', 'search', 'maria');
  const again = setWorkspaceScopedState(store, 'tab-1', 'search', 'maria');
  assert.equal(again, store);
  const changed = setWorkspaceScopedState(store, 'tab-1', 'search', 'joao');
  assert.notEqual(changed, store);
  assert.equal(getWorkspaceScopedState<string>(changed, 'tab-1', 'search'), 'joao');
});

test('finds the latest workspace tab by menu base path', () => {
  const dashboard = createWorkspaceTab({ id: 'tab-dashboard', pathname: '/dashboard', label: 'Dashboard' });
  const clientes = createWorkspaceTab({ id: 'tab-clientes', pathname: '/customers', label: 'Clientes' });
  const clienteNovo = createWorkspaceTab({
    id: 'tab-cliente-novo',
    pathname: '/customers?workspaceMode=new',
    label: 'Customer: New',
  });

  assert.equal(isDashboardWorkspacePath('/dashboard?workspaceTab=abc'), true);
  assert.equal(findWorkspaceTabByBasePath([clienteNovo, clientes, dashboard], '/customers')?.id, 'tab-cliente-novo');
  assert.equal(findWorkspaceTabByBasePath([clienteNovo, clientes, dashboard], '/dashboard')?.id, 'tab-dashboard');
});

test('opens the newest workspace tab on the left and can bring an older tab to the front', () => {
  let store = createEmptyWorkspaceStore();
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-lista', pathname: '/service-orders', label: 'OS' }));
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-nova', pathname: '/service-orders?workspaceMode=new', label: 'OS: Nova' }));

  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['tab-nova', 'tab-lista'],
  );

  store = revealWorkspaceTab(store, 'tab-lista');
  assert.equal(store.activeTabId, 'tab-lista');
  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['tab-lista', 'tab-nova'],
  );

  store = moveWorkspaceTabToFront(store, 'tab-lista');
  assert.equal(store.tabs[0]?.id, 'tab-lista');
});

test('keeps work tabs on the left without pinning Dashboard in the strip', () => {
  let store = createEmptyWorkspaceStore();
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-dashboard', pathname: HOME_WORKSPACE_PATH, label: 'Dashboard' }));
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-os', pathname: '/service-orders', label: 'OS' }));
  store = upsertWorkspaceTab(store, createWorkspaceTab({ id: 'tab-os-nova', pathname: '/service-orders?workspaceMode=new', label: 'OS: Nova' }));

  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['tab-os-nova', 'tab-os'],
  );

  store = revealWorkspaceTab(store, 'tab-os');
  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['tab-os', 'tab-os-nova'],
  );
  assert.equal(store.tabs.some((tab) => tab.pathname === HOME_WORKSPACE_PATH), false);
});

test('strips leftover Dashboard tabs from localStorage so home stays a topbar chip', () => {
  const store = stripHomeWorkspaceTabs({
    tabs: [
      createWorkspaceTab({ id: 'dash-1', pathname: '/dashboard', label: 'Dashboard' }),
      createWorkspaceTab({ id: 'dash-2', pathname: '/dashboard', label: 'Dashboard' }),
      createWorkspaceTab({ id: 'clientes', pathname: '/customers', label: 'Clientes' }),
    ],
    activeTabId: 'dash-2',
    stateByTabId: {
      'dash-1': { leftover: true },
      'dash-2': { keep: true },
      clientes: { form: true },
    },
  });

  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['clientes'],
  );
  assert.equal(store.activeTabId, null);
  assert.deepEqual(Object.keys(store.stateByTabId), ['clientes']);
  assert.deepEqual(
    collapseDuplicateDashboardTabs(store).tabs.map((tab) => tab.id),
    ['clientes'],
  );
});

test('normalizing the store removes Dashboard tabs from localStorage', () => {
  const store = normalizeWorkspaceStore({
    tabs: [
      createWorkspaceTab({ id: 'dash-1', pathname: '/dashboard', label: 'Dashboard' }),
      createWorkspaceTab({ id: 'dash-2', pathname: '/dashboard', label: 'Dashboard' }),
      createWorkspaceTab({ id: 'os-1', pathname: '/service-orders', label: 'OS' }),
    ],
    activeTabId: 'dash-1',
    stateByTabId: {},
  });

  assert.deepEqual(
    store.tabs.map((tab) => tab.id),
    ['os-1'],
  );
  assert.equal(store.activeTabId, null);
});

test('post-login landing on /dashboard goes home without stealing a persisted cadastro tab', () => {
  const store = {
    tabs: [
      createWorkspaceTab({ id: 'tab-dashboard', pathname: '/dashboard', label: 'Dashboard' }),
      createWorkspaceTab({ id: 'tab-empresas', pathname: '/admin/companies', label: 'Empresas' }),
    ],
    activeTabId: 'tab-empresas',
    stateByTabId: {},
  };

  assert.deepEqual(resolveLandingWorkspaceTab(store, '/dashboard', null), {
    activeTabId: null,
    goHome: true,
  });
  assert.deepEqual(resolveLandingWorkspaceTab(store, '/dashboard', 'tab-empresas'), {
    activeTabId: 'tab-empresas',
    goHome: false,
  });
  assert.deepEqual(resolveLandingWorkspaceTab(store, '/admin/companies', null), {
    activeTabId: 'tab-empresas',
    goHome: false,
  });
});

test('post-login landing on /dashboard goes home even when no Dashboard tab exists', () => {
  const store = {
    tabs: [createWorkspaceTab({ id: 'tab-empresas', pathname: '/admin/companies', label: 'Empresas' })],
    activeTabId: 'tab-empresas',
    stateByTabId: {},
  };

  assert.deepEqual(resolveLandingWorkspaceTab(store, '/dashboard', null), {
    activeTabId: null,
    goHome: true,
  });
});

test('workspace tabs use a new storage key so stale v1 tabs are ignored', () => {
  assert.equal(WORKSPACE_STORAGE_KEY, 'anexsys.frontend.workspace-manager.v2');
});

test('groups open workspace tabs under the matching sidebar item', () => {
  const dashboard = createWorkspaceTab({ id: 'tab-dashboard', pathname: '/dashboard', label: 'Dashboard' });
  const clientes = createWorkspaceTab({ id: 'tab-clientes', pathname: '/customers', label: 'Clientes' });
  const clienteNovo = createWorkspaceTab({
    id: 'tab-cliente-novo',
    pathname: '/customers?workspaceMode=new',
    label: 'Cliente: Novo',
  });
  const clienteMaria = createWorkspaceTab({
    id: 'tab-cliente-maria',
    pathname: '/customers?focusCustomerId=9',
    label: 'Cliente: Maria Silva',
    subtitle: '123.456.789-00',
  });
  const empresas = createWorkspaceTab({ id: 'tab-empresas', pathname: '/admin/companies', label: 'Empresas' });
  const tabs = [dashboard, clientes, clienteNovo, clienteMaria, empresas];

  assert.deepEqual(
    listWorkspaceTabsForNavItem(tabs, '/customers').map((tab) => tab.id),
    ['tab-clientes', 'tab-cliente-novo', 'tab-cliente-maria'],
  );
  assert.equal(shouldShowWorkspaceNavSubmenu(tabs, '/customers'), true);
  assert.equal(shouldShowWorkspaceNavSubmenu([dashboard, clientes], '/customers'), false);
  assert.equal(shouldShowWorkspaceNavSubmenu(tabs, '/admin/companies'), false);
  assert.equal(shouldShowWorkspaceNavSubmenu(tabs, '/dashboard'), false);
});
