import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PaymentProviderName } from 'src/shared/domain/enums';
import {
  PaymentProviderAdapter,
  PaymentProviderAuthorizationResult,
  PaymentProviderInitiationRequest,
  PaymentProviderSettlementResult,
} from '../../contracts/provider/payment-provider.contract';
import { PaymentProviderRequestError } from '../../contracts/provider/payment-provider-request-error';
import { PaymentProviderRegistry } from '../../application/finance/payment-provider-registry';

export const CIELO_SANDBOX_BASE_URL = 'https://api.cielo.com.br/sandbox-lio/order-management/v1';
export const CIELO_PRODUCTION_BASE_URL = 'https://api.cielo.com.br/order-management/v1';
export const CIELO_REQUEST_TIMEOUT_MS = 10_000;

type CieloApiConfig = {
  baseUrl: string;
  clientId: string;
  accessToken: string;
  merchantId: string;
};

@Injectable()
export class CieloOrderManagerAdapter implements PaymentProviderAdapter, OnModuleInit {
  readonly provider = PaymentProviderName.CIELO;

  constructor(
    @Inject(PaymentProviderRegistry)
    private readonly providerRegistry: PaymentProviderRegistry,
  ) {}

  onModuleInit(): void {
    this.providerRegistry.register(this);
  }

  async initiatePayment(request: PaymentProviderInitiationRequest): Promise<PaymentProviderAuthorizationResult> {
    const config = this.resolveApiConfig(request.credentials, request.environment);
    const amountInCents = Math.round(request.amount * 100);
    const description = request.description ?? request.referenceNo;

    // Fluxo oficial: cria a ordem como DRAFT e depois a libera para pagamento (PLACE).
    const created = await this.callCielo(config, 'POST', '/orders', {
      number: request.referenceNo,
      reference: description,
      status: 'DRAFT',
      notes: description,
      price: amountInCents,
      items: [
        {
          sku: request.referenceNo,
          name: description,
          unit_price: amountInCents,
          quantity: 1,
          unit_of_measure: 'EACH',
        },
      ],
    });
    const orderId = this.readString(created, 'id');
    if (!orderId) {
      throw new PaymentProviderRequestError({
        failureType: 'invalid_response',
        url: `${config.baseUrl}/orders`,
        method: 'POST',
        status: null,
        responseBody: JSON.stringify(created).slice(0, 500),
        exceptionMessage: 'A Cielo não retornou o identificador da ordem.',
      });
    }
    await this.callCielo(config, 'PUT', `/orders/${orderId}?operation=PLACE`);

    const order = await this.callCielo(config, 'GET', `/orders/${orderId}`);
    const status = this.normalizeOrderStatus(order);
    if (status === 'PAID') {
      return {
        provider: this.provider,
        referenceNo: request.referenceNo,
        authorized: true,
        authorizedAt: new Date().toISOString(),
        acquirerTransactionId: orderId,
      };
    }
    if (status === 'CANCELED' || status === 'CANCELLED' || status === 'ERROR') {
      return {
        provider: this.provider,
        referenceNo: request.referenceNo,
        authorized: false,
        failureReason: `A Cielo respondeu o pedido como ${status}.`,
        acquirerTransactionId: orderId,
      };
    }
    return {
      provider: this.provider,
      referenceNo: request.referenceNo,
      authorized: false,
      awaitingTerminal: true,
      failureReason: null,
      acquirerTransactionId: orderId,
    };
  }

  async reconcileSettlement(
    referenceNo: string,
    options?: { credentials?: Record<string, string>; environment?: string },
  ): Promise<PaymentProviderSettlementResult> {
    const config = this.resolveApiConfig(options?.credentials, options?.environment);
    const orderId = encodeURIComponent(referenceNo);
    const order = await this.callCielo(config, 'GET', `/orders/${orderId}`);
    const transactionsResponse = await this.callCielo(config, 'GET', `/orders/${orderId}/transactions`);
    const transactions = Array.isArray(transactionsResponse)
      ? (transactionsResponse as Record<string, unknown>[])
      : [];
    const orderStatus = this.normalizeOrderStatus(order);
    const confirmed = transactions.find(
      (transaction) => this.readString(transaction, 'status')?.toUpperCase() === 'CONFIRMED',
    );
    const canceled =
      !confirmed &&
      (orderStatus === 'CANCELED' ||
        orderStatus === 'CANCELLED' ||
        transactions.some((transaction) => this.readString(transaction, 'status')?.toUpperCase() === 'CANCELLED'));
    const amountInCents = confirmed ? this.readNumber(confirmed, 'amount') : null;
    return {
      provider: this.provider,
      referenceNo,
      settled: Boolean(confirmed),
      settledAt: confirmed ? new Date().toISOString() : null,
      receivedAmount: amountInCents !== null ? amountInCents / 100 : null,
      canceled,
      acquirerTransactionId: this.readString(order, 'id') ?? referenceNo,
      ...(confirmed ? this.readTransactionFields(confirmed) : {}),
    };
  }

  /** Fluxo oficial de simulação (somente Sandbox): adiciona uma transação CONFIRMED manualmente. */
  async simulateSandboxPayment(
    orderId: string,
    options: { credentials?: Record<string, string>; environment?: string; amount?: number },
  ): Promise<void> {
    if (options.environment === 'production') {
      throw new PaymentProviderRequestError({
        failureType: 'configuration',
        exceptionMessage: 'A simulação de pagamento só existe no ambiente Sandbox da Cielo.',
      });
    }
    const config = this.resolveApiConfig(options.credentials, options.environment);
    const amountInCents = Math.round((options.amount ?? 0) * 100);
    await this.callCielo(config, 'POST', `/orders/${encodeURIComponent(orderId)}/transactions`, {
      status: 'CONFIRMED',
      terminal_number: '00000000',
      authorization_code: '000000',
      number: String(Date.now()).slice(-8),
      amount: amountInCents,
      transaction_type: 'PAYMENT',
      payment_fields: {
        primary_product_name: 'CREDIT',
        secondary_product_name: 'ONE LUMP SUM',
        number_of_quotas: 0,
      },
      card: { brand: 'VISA', mask: '************0000' },
    });
  }

  private resolveApiConfig(
    credentials: Record<string, string> | undefined,
    environment: string | undefined,
  ): CieloApiConfig {
    const clientId = credentials?.clientId?.trim();
    const accessToken = credentials?.accessToken?.trim();
    const merchantId = credentials?.merchantId?.trim();
    if (!clientId || !accessToken || !merchantId) {
      throw new PaymentProviderRequestError({
        failureType: 'configuration',
        exceptionMessage:
          'Credenciais da Cielo incompletas: informe clientId, accessToken e merchantId em Configurações → Pagamentos. O merchantId está na coluna "Merchant ID" do Portal de Desenvolvedores.',
      });
    }
    const baseUrl =
      credentials?.baseUrl?.trim() ||
      (environment === 'production' ? CIELO_PRODUCTION_BASE_URL : CIELO_SANDBOX_BASE_URL);
    return {
      baseUrl,
      clientId,
      accessToken,
      merchantId,
    };
  }

  private async callCielo(
    config: CieloApiConfig,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = `${config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CIELO_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          'Client-Id': config.clientId,
          'Access-Token': config.accessToken,
          'Merchant-Id': config.merchantId,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new PaymentProviderRequestError({
          failureType: 'http_error',
          url,
          method,
          status: response.status,
          responseBody: text.slice(0, 500) || null,
          exceptionMessage: `HTTP ${response.status}`,
        });
      }
      try {
        return text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        throw new PaymentProviderRequestError({
          failureType: 'invalid_response',
          url,
          method,
          status: response.status,
          responseBody: text.slice(0, 500) || null,
          exceptionMessage: 'A resposta da operadora não é um JSON válido.',
        });
      }
    } catch (error) {
      if (error instanceof PaymentProviderRequestError) {
        throw error;
      }
      const isAbort = (error as { name?: string })?.name === 'AbortError';
      const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
      const exceptionMessage =
        [(error as Error)?.message, causeCode].filter(Boolean).join(' ') || 'Falha desconhecida';
      throw new PaymentProviderRequestError({
        failureType: isAbort ? 'timeout' : 'network',
        url,
        method,
        status: null,
        responseBody: null,
        exceptionMessage,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeOrderStatus(order: Record<string, unknown>): string {
    return String(order?.status ?? order?.orderStatus ?? '').toUpperCase();
  }

  private readTransactionFields(transaction: Record<string, unknown>) {
    const paymentFields = (transaction?.payment_fields as Record<string, unknown>) ?? {};
    const card = (transaction?.card as Record<string, unknown>) ?? {};
    return {
      cardBrand: this.readString(card, 'brand') ?? this.readString(paymentFields, 'primary_product_name'),
      installments: this.readNumber(paymentFields, 'number_of_quotas'),
      nsu: this.readString(transaction, 'number'),
      authorizationCode: this.readString(transaction, 'authorization_code'),
    };
  }

  private readString(source: Record<string, unknown> | null | undefined, key: string): string | null {
    const value = source?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readNumber(source: Record<string, unknown> | null | undefined, key: string): number | null {
    const value = source?.[key];
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
