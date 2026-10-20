import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addServiceOrderItemGridRow,
  buildCreateServiceOrderItemsPayload,
  buildServiceOrderItemMutationPlan,
  calculateServiceOrderItemSubtotal,
  canAddServiceOrderItemGridRow,
  createEmptyServiceOrderItemGridRow,
  isNavigationBlankServiceOrderItemRow,
  validateServiceOrderItemGrid,
  applyOsMoneyTyping,
  applyTimePricingToUnitPrice,
  formatOsMoneyInput,
  mapServiceOrderItemsToGridRows,
  MAX_SERVICE_ORDER_ITEMS,
  OS_WORK_CHARS_PER_LINE,
  OS_WORK_MAX_CHARS,
  OS_WORK_PRINT_FONT_PX,
  OS_WORK_PRINT_LINES,
  osOpHeaderTerm,
  osPaymentConditionLabel,
  osReturnKindLabel,
  osWorkPrintHint,
  serviceOrderListLoadBinding,
  parseOsMoney,
  previewNextLinkedServiceOrderNo,
  removeServiceOrderItemGridRow,
  runClosedBagCommit,
  updateServiceOrderItemGridRow,
} from '../../frontend/src/components/service-orders/service-order-workspace-view-model';

test('maps persisted items into visible editable grid rows', () => {
  const rows = mapServiceOrderItemsToGridRows([
    {
      id: 'item-1',
      itemNo: 1,
      itemType: 'Jeans',
      productId: 'product-1',
      serviceId: 'service-1',
      description: 'Original Hem',
      complement: 'Azul marinho',
      brand: 'Levi',
      model: '501',
      serialNo: 'SN-1',
      quantity: '1.0000',
      unitPrice: '25.00',
      discountValue: '0.00',
      timeMinutes: 15,
      status: 'open',
    },
    {
      id: 'item-2',
      itemNo: 2,
      itemType: 'Shirt',
      description: 'Sleeve Adjustment',
      quantity: '1.0000',
      unitPrice: null,
      discountValue: null,
      status: 'cancelled',
    },
  ]);

  assert.deepEqual(rows, [
    {
      localId: 'item-1',
      persistedItemId: 'item-1',
      itemNo: 1,
      itemType: 'Jeans',
      productId: 'product-1',
      serviceId: 'service-1',
      description: 'Original Hem',
      complement: 'Azul marinho',
      brand: 'Levi',
      model: '501',
      serialNo: 'SN-1',
      quantity: '1',
      unitPrice: '25,00',
      discountValue: '0,00',
      timeMinutes: '15',
      status: 'open',
      isEditing: false,
      isNew: false,
      isRemoved: false,
    },
  ]);
});

test('builds create payload for all visible item rows', () => {
  const rows = addServiceOrderItemGridRow([]);
  const updatedRows = updateServiceOrderItemGridRow(rows, rows[0].localId, {
    itemType: 'Party Dress',
    productId: 'product-2',
    serviceId: 'service-2',
    description: 'Hem Adjustment',
    complement: 'Na lateral',
    brand: 'Zara',
    model: 'Festa',
    serialNo: 'SN-9',
    quantity: '2',
    unitPrice: '80',
    discountValue: '10',
    timeMinutes: '45',
  });

  assert.deepEqual(buildCreateServiceOrderItemsPayload(updatedRows), [
    {
      itemType: 'Party Dress',
      productId: 'product-2',
      serviceId: 'service-2',
      description: 'Hem Adjustment',
      complement: 'Na lateral',
      brand: 'Zara',
      model: 'Festa',
      serialNo: 'SN-9',
      quantity: 1,
      unitPrice: 80,
      discountValue: 10,
      timeMinutes: 45,
    },
  ]);
});

test('creates update and remove plans for existing rows and create plan for new rows', () => {
  const originalItems = [
    {
      id: 'item-1',
      itemNo: 1,
      itemType: 'Jeans',
      description: 'Original Hem',
      quantity: '1.0000',
      unitPrice: '25.00',
      discountValue: '0.00',
      status: 'open',
    },
  ];

  let rows = mapServiceOrderItemsToGridRows(originalItems);
  rows = updateServiceOrderItemGridRow(rows, 'item-1', {
    description: 'Keep original appearance',
    isEditing: true,
  });
  rows = addServiceOrderItemGridRow(rows);
  rows = updateServiceOrderItemGridRow(rows, 'draft-2', {
    itemType: 'Shirt',
    description: 'Left cuff only',
    quantity: '1',
  });

  const plan = buildServiceOrderItemMutationPlan(rows, originalItems);
  assert.deepEqual(plan, {
    create: [
      {
        itemType: 'Shirt',
        productId: undefined,
        serviceId: undefined,
        description: 'Left cuff only',
        complement: undefined,
        brand: '',
        model: '',
        serialNo: '',
        quantity: 1,
        unitPrice: undefined,
        discountValue: undefined,
        timeMinutes: null,
      },
    ],
    update: [
      {
        itemId: 'item-1',
        itemType: 'Jeans',
        productId: undefined,
        serviceId: undefined,
        description: 'Keep original appearance',
        complement: undefined,
        brand: '',
        model: '',
        serialNo: '',
        quantity: 1,
        unitPrice: 25,
        discountValue: 0,
        timeMinutes: null,
      },
    ],
    remove: [],
  });
});

test('marks persisted rows for removal and removes new rows immediately', () => {
  const originalItems = [
    {
      id: 'item-1',
      itemNo: 1,
      itemType: 'Jeans',
      description: 'Original Hem',
      quantity: '1.0000',
      unitPrice: '25.00',
      discountValue: '0.00',
      status: 'open',
    },
  ];

  let rows = mapServiceOrderItemsToGridRows(originalItems);
  rows = addServiceOrderItemGridRow(rows);
  rows = removeServiceOrderItemGridRow(rows, 'draft-2');
  rows = removeServiceOrderItemGridRow(rows, 'item-1');

  const plan = buildServiceOrderItemMutationPlan(rows, originalItems);
  assert.deepEqual(plan, {
    create: [],
    update: [],
    remove: [{ itemId: 'item-1', status: 'cancelled' }],
  });
});

test('does not emit updates for numerically equivalent values', () => {
  const originalItems = [
    {
      id: 'item-1',
      itemNo: 1,
      itemType: 'Jeans',
      description: 'Original Hem',
      quantity: '1.0000',
      unitPrice: '25.00',
      discountValue: '0.00',
      status: 'open',
    },
  ];

  let rows = mapServiceOrderItemsToGridRows(originalItems);
  rows = updateServiceOrderItemGridRow(rows, 'item-1', {
    quantity: '1',
    unitPrice: '25',
    discountValue: '0',
  });

  const plan = buildServiceOrderItemMutationPlan(rows, originalItems);
  assert.deepEqual(plan, {
    create: [],
    update: [],
    remove: [],
  });
});

test('discards a navigation blank row and still requires a real piece', () => {
  const filled = updateServiceOrderItemGridRow(addServiceOrderItemGridRow([]), 'draft-1', {
    itemType: 'Calça',
    productId: 'product-1',
    serviceId: 'service-1',
    description: 'Bainha',
    brand: 'Levi',
    quantity: '1',
    unitPrice: '40',
    discountValue: '0',
  });
  const withBlank = addServiceOrderItemGridRow(filled);
  const blank = withBlank[withBlank.length - 1];

  assert.equal(isNavigationBlankServiceOrderItemRow(blank), true);
  assert.equal(validateServiceOrderItemGrid(withBlank, { requireAtLeastOne: true, maxItems: 5 }), null);
  assert.equal(buildCreateServiceOrderItemsPayload(withBlank).length, 1);
  assert.equal(buildServiceOrderItemMutationPlan(withBlank, []).create.length, 1);

  const onlyBlank = [createEmptyServiceOrderItemGridRow(1)];
  assert.equal(
    validateServiceOrderItemGrid(onlyBlank, { requireAtLeastOne: true, maxItems: 5 }),
    'Inclua pelo menos uma peça antes de salvar a OS.',
  );
  assert.equal(validateServiceOrderItemGrid(onlyBlank, { requireAtLeastOne: false, maxItems: 5 }), null);
  assert.deepEqual(buildCreateServiceOrderItemsPayload(onlyBlank), []);

  const partial = updateServiceOrderItemGridRow(onlyBlank, 'draft-1', { complement: 'Barra' });
  assert.equal(isNavigationBlankServiceOrderItemRow(partial[0]), false);
  assert.equal(
    validateServiceOrderItemGrid(partial, { requireAtLeastOne: true, maxItems: 5 }),
    'Cada peça precisa de produto e serviço antes de salvar.',
  );
});

test('caps the visible piece count at five and calculates the line subtotal', () => {
  let rows = addServiceOrderItemGridRow([]);
  for (let index = 0; index < MAX_SERVICE_ORDER_ITEMS + 2; index += 1) {
    rows = addServiceOrderItemGridRow(rows);
  }

  assert.equal(rows.length, MAX_SERVICE_ORDER_ITEMS);
  assert.equal(canAddServiceOrderItemGridRow(rows), false);
  assert.equal(
    calculateServiceOrderItemSubtotal({ quantity: '2', unitPrice: '40', discountValue: '10' }),
    70,
  );
});

test('respects a parametrized piece limit when adding rows', () => {
  let rows = addServiceOrderItemGridRow([], 3);
  rows = addServiceOrderItemGridRow(rows, 3);
  rows = addServiceOrderItemGridRow(rows, 3);
  rows = addServiceOrderItemGridRow(rows, 3);

  assert.equal(rows.length, 3);
  assert.equal(canAddServiceOrderItemGridRow(rows, 3), false);
  assert.equal(canAddServiceOrderItemGridRow(rows, 5), true);
});

test('opens the next version even when printing is blocked', async () => {
  const calls: string[] = [];
  const result = await runClosedBagCommit({
    wantsNextVersion: true,
    async spawnNext() {
      calls.push('spawn');
      return { orderNo: 'AAA000001-A' };
    },
    async print() {
      calls.push('print');
      throw new Error('O navegador bloqueou a janela de impressão.');
    },
  });

  assert.deepEqual(calls, ['spawn', 'print']);
  assert.equal(result.next?.orderNo, 'AAA000001-A');
  assert.equal(result.printed, null);
  assert.match(String(result.printError), /bloqueou/);
});

test('does not spawn a version when the next-version mark is off', async () => {
  const result = await runClosedBagCommit({
    wantsNextVersion: false,
    async spawnNext() {
      throw new Error('não deveria abrir versão');
    },
    async print() {
      return { productionNo: 'OP-1' };
    },
  });

  assert.equal(result.next, null);
  assert.equal(result.printed?.productionNo, 'OP-1');
  assert.equal(result.printError, null);
});

test('labels payment as paid only when the OS is fully settled', () => {
  assert.equal(osPaymentConditionLabel('paid'), 'Pago');
  assert.equal(osPaymentConditionLabel('partial'), 'Saldo em aberto');
  assert.equal(osPaymentConditionLabel('pending'), 'Saldo em aberto');
  assert.equal(osPaymentConditionLabel(null), 'Saldo em aberto');
});

test('uses Reconserto or Em garantia on the OP header for in-window returns', () => {
  assert.equal(osReturnKindLabel('reconserto'), 'Reconserto');
  assert.equal(osReturnKindLabel('warranty'), 'Em garantia');
  assert.equal(osOpHeaderTerm({ returnKind: 'reconserto', paymentStatus: 'paid' }), 'Reconserto');
  assert.equal(osOpHeaderTerm({ returnKind: 'warranty', paymentStatus: 'pending' }), 'Em garantia');
  assert.equal(osOpHeaderTerm({ returnKind: 'charged', paymentStatus: 'paid' }), 'Pago');
  assert.equal(osReturnKindLabel('counter'), 'Refação no balcão');
  assert.equal(osOpHeaderTerm({ returnKind: 'counter', paymentStatus: 'pending' }), 'Refação no balcão');
});

test('fails the save when print is blocked and no next version was requested', async () => {
  await assert.rejects(
    () =>
      runClosedBagCommit({
        wantsNextVersion: false,
        async spawnNext() {
          return { orderNo: 'AAA000001-A' };
        },
        async print() {
          throw new Error('O navegador bloqueou a janela de impressão.');
        },
      }),
    /bloqueou/,
  );
});

test('types valor and desconto as Brazilian money with cents', () => {
  assert.equal(applyOsMoneyTyping('1'), '0,01');
  assert.equal(applyOsMoneyTyping('1500000'), '15.000,00');
  assert.equal(applyOsMoneyTyping('15.000,00'), '15.000,00');
  assert.equal(formatOsMoneyInput('15000.00'), '15.000,00');
  assert.equal(parseOsMoney('15.000,00'), 15000);
  assert.equal(parseOsMoney('15000.00'), 15000);
  assert.equal(parseOsMoney('25,00'), 25);
});

test('keeps the fixed combo price when no minute rate is active', () => {
  assert.equal(
    applyTimePricingToUnitPrice({ timeMinutes: '30', minuteRate: null, comboUnitPrice: '35,00' }),
    '35,00',
  );
});

test('time pricing prevails over the combo fixed price', () => {
  assert.equal(
    applyTimePricingToUnitPrice({ timeMinutes: '30', minuteRate: 2, comboUnitPrice: '35,00' }),
    '60,00',
  );
});

test('time pricing applies even without a registered combo price', () => {
  assert.equal(
    applyTimePricingToUnitPrice({ timeMinutes: '30', minuteRate: 2, comboUnitPrice: '' }),
    '60,00',
  );
});

test('clearing the time restores the combo original price', () => {
  assert.equal(
    applyTimePricingToUnitPrice({ timeMinutes: '', minuteRate: 2, comboUnitPrice: '35,00' }),
    '35,00',
  );
});

test('previews the next linked OS number from the current plate', () => {
  assert.equal(previewNextLinkedServiceOrderNo('AAA000001'), 'AAA000001-1');
  assert.equal(previewNextLinkedServiceOrderNo('AAA000001-1', ['AAA000001', 'AAA000001-1']), 'AAA000001-2');
  assert.equal(previewNextLinkedServiceOrderNo('00002', ['00002']), '00002-1');
  assert.equal(previewNextLinkedServiceOrderNo('AAA000001-C', ['AAA000001', 'AAA000001-C']), 'AAA000001-1');
});

test('does not rebind the open OS when the list refreshes without a preferred id', () => {
  assert.deepEqual(serviceOrderListLoadBinding(), { bind: false });
  assert.deepEqual(serviceOrderListLoadBinding(undefined), { bind: false });
  assert.deepEqual(serviceOrderListLoadBinding(null), { bind: true, activeId: null });
  assert.deepEqual(serviceOrderListLoadBinding('os-1'), { bind: true, activeId: 'os-1' });
});

test('keeps Detalhar o serviço within the A5 15px / 3-line budget after column S', () => {
  assert.equal(OS_WORK_PRINT_FONT_PX, 15);
  assert.equal(OS_WORK_PRINT_LINES, 3);
  assert.equal(OS_WORK_CHARS_PER_LINE, 34);
  assert.equal(OS_WORK_MAX_CHARS, 102);
  assert.equal(osWorkPrintHint('', 1), 'S1 · linha 1 de 3 · 0/34');
  assert.equal(osWorkPrintHint('abc', 2), 'S2 · linha 1 de 3 · 3/34');
  assert.equal(osWorkPrintHint('a'.repeat(34), 3), 'S3 · linha 1 de 3 · 34/34');
  assert.equal(osWorkPrintHint('a'.repeat(35), 4), 'S4 · linha 2 de 3 · 1/34');
  assert.equal(osWorkPrintHint('a'.repeat(102), 5), 'S5 · linha 3 de 3 · 34/34');
});
