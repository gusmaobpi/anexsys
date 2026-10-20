import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOsWhatsAppMessage,
  buildProductionOrderPrintHtml,
  buildServiceOrderPrintHtml,
  firstName,
  OP_A5_PRINT_CSS,
  opShelfDateParts,
  toWhatsAppPhone,
} from '../../frontend/src/components/service-orders/os-documents';

test('builds the WhatsApp resend text without prices', () => {
  const message = buildOsWhatsAppMessage({
    customerName: 'Marina Andrade',
    companyName: 'Ateliê A',
    orderNo: 'OS-14555',
  });

  assert.equal(firstName('Marina Andrade'), 'Marina');
  assert.equal(toWhatsAppPhone('(11) 98888-7777'), '5511988887777');
  assert.match(message, /OS-14555/);
  assert.doesNotMatch(message, /R\$|valor|preço/i);
});

test('builds the A5 OP with the shelf face and without prices or quantity', () => {
  assert.deepEqual(opShelfDateParts('2026-10-18'), { day: '18', month: '10' });

  const html = buildProductionOrderPrintHtml(
    {
      productionNo: 'OP-1',
      serviceOrder: {
        orderNo: 'AAA000001',
        openedAt: '2026-10-03T10:00:00.000Z',
        promisedDeliveryDate: '2026-10-18',
      },
      customer: { legalName: 'Sandra Legramanti' },
      pieceDescription: null,
      instructions: null,
      items: [
        {
          itemType: 'Calça',
          description: 'Bainha',
          complement: 'teste',
          brand: 'Zara',
          model: 'Festa',
          serialNo: 'SN-22',
        },
        { itemType: 'Saia', description: 'Ajuste lateral', complement: 'verde' },
        { itemType: 'Saia', description: 'Ajuste de cintura', complement: 'sem cor' },
        { itemType: 'Terno', description: 'Troca de zíper', complement: 'preto' },
        { itemType: 'Jaqueta', description: 'Barra', complement: 'Preto' },
      ],
      qrCode: { codeValue: 'AAA000001', reissueNo: 0 },
    },
    'Atelier de costura Iza Gusmão',
    'Saldo em aberto',
  );

  assert.match(html, /Entrada/);
  assert.match(html, /class="op-title__no">AAA000001/);
  assert.match(html, /class="op-shelf__os">AAA000001/);
  assert.match(html, /<th title="Sequência">S<\/th>/);
  assert.match(html, /<th>Produto<\/th>/);
  assert.match(html, /<th>Serviço<\/th>/);
  assert.match(html, /<th>Detalhar o serviço<\/th>/);
  assert.match(html, /class="op-seq">1/);
  assert.match(html, /class="op-seq">2/);
  assert.match(html, /class="op-seq">3/);
  assert.match(html, /class="op-seq">4/);
  assert.match(html, /class="op-seq">5/);
  assert.match(html, /class="op-item__work">teste/);
  assert.match(OP_A5_PRINT_CSS, /-webkit-line-clamp: 3/);
  assert.match(OP_A5_PRINT_CSS, /overflow-wrap: anywhere/);
  assert.match(OP_A5_PRINT_CSS, /\.op-item__work \{ font-size: 15px; \}/);
  assert.match(OP_A5_PRINT_CSS, /nth-child\(1\)[^{]*\{ width: 7%;/);
  assert.match(html, /Ajuste de cintura/);
  assert.match(html, /class="op-item__equip">Zara · Festa · SN-22/);
  assert.match(html, /class="op-pay">Saldo em aberto/);
  assert.match(html, /class="op-pickup__title">Retirada/);
  assert.match(html, /class="op-pickup__field">Nome/);
  assert.match(html, /class="op-pickup__field">Data/);
  assert.match(html, /class="op-pickup__field">Assinatura/);
  assert.match(html, /class="op-shelf__day">18/);
  assert.match(html, /class="op-shelf__month">\/10/);
  assert.doesNotMatch(html, />Complemento</);
  assert.doesNotMatch(html, /Pago na retirada/);
  assert.doesNotMatch(html, /R\$|Qtd|quantidade|unitPrice|80,00/i);
  assert.doesNotMatch(html, /Previsão de Entrega[\s\S]*10\/10\/2026/i);

  const unpaidDefault = buildProductionOrderPrintHtml(
    {
      productionNo: 'OP-1',
      serviceOrder: { orderNo: 'AAA000001', promisedDeliveryDate: '2026-10-18' },
      customer: { legalName: 'Sandra Legramanti' },
      pieceDescription: null,
      instructions: null,
      items: [{ itemType: 'Blusa', description: 'Conserto' }],
      qrCode: null,
    },
    'Atelier',
  );
  assert.match(unpaidDefault, /Saldo em aberto/);

  const paidHtml = buildProductionOrderPrintHtml(
    {
      productionNo: 'OP-1',
      serviceOrder: { orderNo: 'AAA000001', promisedDeliveryDate: '2026-10-18' },
      customer: { legalName: 'Sandra Legramanti' },
      pieceDescription: null,
      instructions: null,
      items: [{ itemType: 'Blusa', description: 'Conserto' }],
      qrCode: null,
    },
    'Atelier',
    'Pago',
  );
  assert.match(paidHtml, /class="op-pay">Pago</);
  assert.doesNotMatch(paidHtml, /Saldo em aberto/);

  const reconsertoHtml = buildProductionOrderPrintHtml(
    {
      productionNo: 'OP-1',
      serviceOrder: { orderNo: 'AAA000009', promisedDeliveryDate: '2026-10-18', returnKind: 'reconserto' },
      customer: { legalName: 'Sandra Legramanti' },
      pieceDescription: null,
      instructions: null,
      items: [{ itemType: 'Calça', description: 'Bainha' }],
      qrCode: null,
    },
    'Atelier',
    'Reconserto',
  );
  assert.match(reconsertoHtml, /class="op-pay">Reconserto</);

  const reworkHtml = buildProductionOrderPrintHtml(
    {
      productionNo: 'OP-1',
      serviceOrder: { orderNo: 'AAA000001', promisedDeliveryDate: '2026-10-18' },
      customer: { legalName: 'Sandra Legramanti' },
      pieceDescription: null,
      instructions: null,
      items: [
        {
          itemType: 'Saia',
          description: 'Ajuste de cintura',
          complement: 'sem cor',
          rejectionReason: 'ficou torto, alinhar a parte',
        },
      ],
      qrCode: null,
      version: { versionNo: 2, versionReason: 'rework' },
    },
    'Atelier',
    'Saldo em aberto',
  );
  assert.match(reworkHtml, /Refação · versão 2/);
  assert.match(reworkHtml, /Ajuste de cintura/);
  assert.match(reworkHtml, /Refazer/);
  assert.match(reworkHtml, /ficou torto, alinhar a parte/);
  assert.match(reworkHtml, /class="op-item__work">sem cor/);

  const proofHtml = buildProductionOrderPrintHtml(
    {
      productionNo: 'OP-1',
      serviceOrder: { orderNo: 'AAA000001', promisedDeliveryDate: '2026-10-18' },
      customer: { legalName: 'Sandra Legramanti' },
      pieceDescription: null,
      instructions: null,
      items: [
        {
          itemType: 'Calça',
          description: 'Bainha',
          complement: 'barra original',
          proofNote: 'subir 1 cm na barra',
        },
      ],
      qrCode: null,
    },
    'Atelier',
    'Saldo em aberto',
  );
  assert.match(proofHtml, /class="op-item__proof-label">Prova/);
  assert.match(proofHtml, /subir 1 cm na barra/);
  assert.match(proofHtml, /class="op-item__work">barra original/);
  assert.doesNotMatch(proofHtml, /Refazer/);
  assert.match(OP_A5_PRINT_CSS, /\.op-item__proof /);
});

test('builds the public OS sheet with the same fields as the printed service order', () => {
  const html = buildServiceOrderPrintHtml(
    {
      documentType: 'service_order',
      serviceOrderId: 'so-1',
      orderNo: 'AAA000001',
      status: 'ready_for_pickup',
      statusLabel: 'Pronto para retirada',
      openedAt: '2026-10-03T10:00:00.000Z',
      promisedDeliveryDate: '2026-10-18',
      promisedDeliveryTime: '18:00',
      deliveryType: 'Standard',
      customer: { legalName: 'Sandra Legramanti', phone: null, email: null },
      items: [
        {
          productName: 'Calça',
          serviceName: 'Bainha',
          complement: 'barra',
          quantity: '1.0000',
          unitPrice: '90.00',
          discountValue: null,
          subtotal: '90.00',
        },
      ],
      totalValue: '90.00',
      customerNotes: 'Barra original',
    },
    'Ateliê A',
  );

  assert.match(html, /Ordem de serviço AAA000001/);
  assert.match(html, /<th>Detalhar o serviço<\/th>/);
  assert.match(html, /Sandra Legramanti/);
  assert.match(html, /Pronto para retirada/);
  assert.match(html, /Bainha/);
  assert.match(html, /R\$\s*90,00/);
  assert.match(html, /Barra original/);
  assert.doesNotMatch(html, /Ana|atendente|audit/i);
  assert.doesNotMatch(html, /Aprovação:/);
});

test('prints the approval date and time on the service order', () => {
  const html = buildServiceOrderPrintHtml(
    {
      documentType: 'service_order',
      serviceOrderId: 'so-1',
      orderNo: 'AAA000012-A',
      status: 'open',
      openedAt: '2026-10-03T10:00:00.000Z',
      promisedDeliveryDate: '2026-10-18',
      promisedDeliveryTime: '18:00',
      deliveryType: 'Standard',
      customer: { legalName: 'Sandra Legramanti', phone: null, email: null },
      items: [],
      totalValue: '90.00',
      customerNotes: null,
      approvedAt: '2026-10-09T03:15:00.000Z',
      approvalMethod: 'paper',
    },
    'Ateliê A',
  );

  assert.match(html, /Aprovação:/);
  assert.match(html, /Papel/);
});
