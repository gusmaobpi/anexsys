import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  CieloOrderManagerAdapter,
  CIELO_SANDBOX_BASE_URL,
} from 'src/modules/finance/infrastructure/providers/cielo-order-manager.adapter';
import { PaymentProviderRequestError } from 'src/modules/finance/contracts/provider/payment-provider-request-error';
import { PaymentProviderRegistry } from 'src/modules/finance/application/finance/payment-provider-registry';

const originalFetch = globalThis.fetch;

type FetchCall = {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
};

function mockFetchSequence(responses: Array<{ payload: unknown; status?: number; rawText?: string }>): FetchCall[] {
  const calls: FetchCall[] = [];
  let index = 0;
  globalThis.fetch = (async (url: unknown, init?: never) => {
    calls.push({ url: String(url), init });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const status = response.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => response.rawText ?? JSON.stringify(response.payload),
    };
  }) as never;
  return calls;
}

function mockFetchReject(error: unknown): void {
  globalThis.fetch = (async () => {
    throw error;
  }) as never;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'cielo',
    referenceNo: 'ch_test_1',
    paymentMethod: 'card',
    amount: 60,
    serviceOrderId: 'os-1',
    credentials: { clientId: 'client-1', accessToken: 'token-1', merchantId: 'merchant-1' },
    environment: 'sandbox',
    terminalCode: 'SN-001',
    description: 'OS AAA000001',
    ...overrides,
  } as never;
}

describe('CieloOrderManagerAdapter', () => {
  it('registers itself in the provider registry', () => {
    const registry = new PaymentProviderRegistry();
    const adapter = new CieloOrderManagerAdapter(registry);
    adapter.onModuleInit();
    assert.equal(registry.getAdapter('cielo' as never), adapter);
  });

  it('creates the order as DRAFT, releases it with PLACE and reads it back', async () => {
    const calls = mockFetchSequence([
      { payload: { id: 'order-1' } },
      { payload: {} },
      { payload: { id: 'order-1', status: 'PLACED' } },
    ]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    await adapter.initiatePayment(buildRequest());

    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, `${CIELO_SANDBOX_BASE_URL}/orders`);
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal(calls[0].init?.headers?.['Client-Id'], 'client-1');
    assert.equal(calls[0].init?.headers?.['Access-Token'], 'token-1');
    assert.equal(calls[0].init?.headers?.['Merchant-Id'], 'merchant-1');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      number: 'ch_test_1',
      reference: 'OS AAA000001',
      status: 'DRAFT',
      notes: 'OS AAA000001',
      price: 6000,
      items: [{ sku: 'ch_test_1', name: 'OS AAA000001', unit_price: 6000, quantity: 1, unit_of_measure: 'EACH' }],
    });
    assert.equal(calls[1].url, `${CIELO_SANDBOX_BASE_URL}/orders/order-1?operation=PLACE`);
    assert.equal(calls[1].init?.method, 'PUT');
    assert.equal(calls[2].url, `${CIELO_SANDBOX_BASE_URL}/orders/order-1`);
    assert.equal(calls[2].init?.method, 'GET');
  });

  it('sends the chosen payment code so the Cielo Smart opens on it', async () => {
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());
    const cases = [
      { informedModality: 'credit', payment_code: 'CREDITO_AVISTA', installments: 0 },
      { informedModality: 'debit', payment_code: 'DEBITO_AVISTA', installments: 0 },
      { informedModality: 'pix', payment_code: 'PIX' },
    ];

    for (const item of cases) {
      const calls = mockFetchSequence([
        { payload: { id: 'order-1' } },
        { payload: {} },
        { payload: { id: 'order-1', status: 'PLACED' } },
      ]);
      await adapter.initiatePayment(buildRequest({ informedModality: item.informedModality }));
      const body = JSON.parse(String(calls[0].init?.body));
      assert.equal(body.payment_code, item.payment_code);
      assert.equal(body.installments, item.installments);
    }
  });

  it('marks the charge as awaiting the terminal when the order is placed', async () => {
    mockFetchSequence([{ payload: { id: 'order-1' } }, { payload: {} }, { payload: { id: 'order-1', status: 'PLACED' } }]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    const result = await adapter.initiatePayment(buildRequest());

    assert.equal(result.authorized, false);
    assert.equal(result.awaitingTerminal, true);
    assert.equal(result.acquirerTransactionId, 'order-1');
  });

  it('authorizes immediately when the order comes back paid', async () => {
    mockFetchSequence([{ payload: { id: 'order-1' } }, { payload: {} }, { payload: { id: 'order-1', status: 'PAID' } }]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    const result = await adapter.initiatePayment(buildRequest());

    assert.equal(result.authorized, true);
    assert.equal(result.awaitingTerminal ?? false, false);
  });

  it('maps a confirmed transaction to settled on the status consult, with card fields', async () => {
    mockFetchSequence([
      { payload: { id: 'order-1', status: 'PLACED' } },
      {
        payload: [
          {
            id: 'tx-1',
            status: 'CONFIRMED',
            amount: 6000,
            number: '672836',
            authorization_code: '008619',
            card: { brand: 'VISA' },
            payment_fields: { primary_product_name: 'CREDIT', number_of_quotas: 0 },
          },
        ],
      },
    ]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    const result = await adapter.reconcileSettlement('order-1', {
      credentials: { clientId: 'client-1', accessToken: 'token-1', merchantId: 'merchant-1' },
      environment: 'sandbox',
    });

    assert.equal(result.settled, true);
    assert.equal(result.receivedAmount, 60);
    assert.equal(result.cardBrand, 'VISA');
    assert.equal(result.confirmedModality, 'credit');
    assert.equal(result.operatorProductCode, 'CREDIT');
    assert.equal(result.nsu, '672836');
    assert.equal(result.authorizationCode, '008619');
    assert.equal(result.installments, 0);
  });

  it('maps a canceled order on the status consult', async () => {
    mockFetchSequence([{ payload: { id: 'order-1', status: 'CANCELED' } }, { payload: [] }]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    const result = await adapter.reconcileSettlement('order-1', {
      credentials: { clientId: 'client-1', accessToken: 'token-1', merchantId: 'merchant-1' },
      environment: 'sandbox',
    });

    assert.equal(result.settled, false);
    assert.equal(result.canceled, true);
  });

  it('simulates a sandbox payment by adding a CONFIRMED transaction', async () => {
    const calls = mockFetchSequence([{ payload: {} }]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    await adapter.simulateSandboxPayment('order-1', {
      credentials: { clientId: 'client-1', accessToken: 'token-1', merchantId: 'merchant-1' },
      environment: 'sandbox',
      amount: 60,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${CIELO_SANDBOX_BASE_URL}/orders/order-1/transactions`);
    assert.equal(calls[0].init?.method, 'POST');
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.status, 'CONFIRMED');
    assert.equal(body.transaction_type, 'PAYMENT');
    assert.equal(body.amount, 6000);
    assert.equal(body.paymentFields.primaryProductName, 'CREDIT');
    assert.equal(body.card.brand, 'VISA');
    assert.equal(body.payment_fields, undefined);
  });

  it('closes the Cielo order when the attendant cancels the charge', async () => {
    const calls = mockFetchSequence([{ payload: {} }]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    await adapter.cancelOrder('order-1', {
      credentials: { clientId: 'client-1', accessToken: 'token-1', merchantId: 'merchant-1' },
      environment: 'sandbox',
    });

    assert.equal(calls[0].url, `${CIELO_SANDBOX_BASE_URL}/orders/order-1?operation=CLOSE`);
    assert.equal(calls[0].init?.method, 'PUT');
  });

  it('rejects the simulation in production', async () => {
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    await assert.rejects(() =>
      adapter.simulateSandboxPayment('order-1', {
        credentials: { clientId: 'client-1', accessToken: 'token-1', merchantId: 'merchant-1' },
        environment: 'production',
        amount: 60,
      }),
    );
  });

  it('requires the Cielo credentials', async () => {
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    await assert.rejects(() => adapter.initiatePayment(buildRequest({ credentials: {} })));
  });

  it('maps HTTP errors with status and a sanitized response body', async () => {
    mockFetchSequence([{ payload: { message: 'invalid client' }, status: 401 }]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    const error = await adapter.initiatePayment(buildRequest()).catch((caught) => caught);

    assert.ok(error instanceof PaymentProviderRequestError);
    assert.equal(error.details.failureType, 'http_error');
    assert.equal(error.details.status, 401);
    assert.equal(error.details.url, `${CIELO_SANDBOX_BASE_URL}/orders`);
    assert.equal(error.details.method, 'POST');
    assert.match(error.details.responseBody ?? '', /invalid client/);
    assert.match(error.toUserMessage(), /401 Unauthorized/);
    assert.equal(JSON.stringify(error.details).includes('client-1'), false);
    assert.equal(JSON.stringify(error.details).includes('token-1'), false);
  });

  it('maps network failures with the cause code', async () => {
    const failure = new TypeError('fetch failed');
    (failure as { cause?: { code?: string } }).cause = { code: 'ENOTFOUND' };
    mockFetchReject(failure);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    const error = await adapter.initiatePayment(buildRequest()).catch((caught) => caught);

    assert.ok(error instanceof PaymentProviderRequestError);
    assert.equal(error.details.failureType, 'network');
    assert.match(error.details.exceptionMessage, /ENOTFOUND/);
    assert.match(error.toUserMessage(), /Falha de rede/);
  });

  it('maps aborts to timeout', async () => {
    mockFetchReject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    const error = await adapter.initiatePayment(buildRequest()).catch((caught) => caught);

    assert.ok(error instanceof PaymentProviderRequestError);
    assert.equal(error.details.failureType, 'timeout');
    assert.match(error.toUserMessage(), /timeout/i);
  });

  it('maps non-JSON success responses to invalid_response', async () => {
    mockFetchSequence([{ payload: null, rawText: '<html>not json</html>' }]);
    const adapter = new CieloOrderManagerAdapter(new PaymentProviderRegistry());

    const error = await adapter.initiatePayment(buildRequest()).catch((caught) => caught);

    assert.ok(error instanceof PaymentProviderRequestError);
    assert.equal(error.details.failureType, 'invalid_response');
  });
});
