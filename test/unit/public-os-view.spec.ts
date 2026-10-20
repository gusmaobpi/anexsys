import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describePublicOsError,
  publicOsCta,
  toPublicOsPrintView,
} from '../../frontend/src/components/service-orders/public-os-view';

test('hides start:dev instructions from the public OS link', () => {
  assert.match(
    describePublicOsError(
      new Error('O servidor não concluiu a operação. Pare o processo da porta 3000, rode npm run start:dev outra vez e tente de novo.'),
    ),
    /versão antiga|start:dev/,
  );
  assert.equal(describePublicOsError(new Error('Este link não foi encontrado.')), 'Este link não foi encontrado.');
  assert.match(
    describePublicOsError(new Error('O servidor da OS não respondeu na porta 3000. Deixe o npm run start:dev no ar e recarregue.')),
    /não está no ar/,
  );
});

test('maps the public OS payload onto the printed service order', () => {
  const printView = toPublicOsPrintView({
    orderNo: 'AAA000001',
    companyName: 'Ateliê A',
    customerFirstName: 'Sandra',
    customerName: 'Sandra Legramanti',
    status: 'in_production',
    statusLabel: 'Em produção',
    openedAt: '2026-10-03T10:00:00.000Z',
    promisedDeliveryDate: '2026-10-18',
    items: [{ itemNo: 1, itemType: 'Calça', description: 'Bainha', unitPrice: '90.00', subtotal: '90.00' }],
    totalValue: '90.00',
    recebiReady: false,
    pickedUp: false,
    paymentLabel: 'Saldo em aberto',
  });

  assert.equal(printView.orderNo, 'AAA000001');
  assert.equal(printView.customer.legalName, 'Sandra Legramanti');
  assert.equal(printView.statusLabel, 'Em produção');
  assert.equal(printView.items[0].unitPrice, '90.00');
});

test('the public micro-form only enables Recebi while the counter window is open', () => {
  assert.equal(publicOsCta({ pickedUp: false, recebiReady: false, status: 'in_production' }), 'follow');
  assert.equal(publicOsCta({ pickedUp: false, recebiReady: false, status: 'ready_for_pickup' }), 'waiting_counter');
  assert.equal(publicOsCta({ pickedUp: false, recebiReady: true, status: 'ready_for_pickup' }), 'recebi');
  assert.equal(publicOsCta({ pickedUp: true, recebiReady: false, status: 'picked_up' }), 'picked_up');
});
