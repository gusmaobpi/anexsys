export type PaymentProviderFailureType =
  | 'http_error'
  | 'timeout'
  | 'network'
  | 'invalid_response'
  | 'configuration'
  | 'unexpected';

/**
 * Diagnóstico sanitizado de uma falha na chamada à operadora.
 * NUNCA incluir clientId, accessToken ou qualquer credencial sensível.
 */
export type PaymentProviderErrorDetails = {
  failureType: PaymentProviderFailureType;
  url?: string | null;
  method?: string | null;
  status?: number | null;
  responseBody?: string | null;
  exceptionMessage: string;
};

const HTTP_STATUS_LABELS: Record<number, string> = {
  401: '401 Unauthorized',
  403: '403 Forbidden',
  404: '404 Not Found',
  422: '422 Validation Error',
};

export class PaymentProviderRequestError extends Error {
  readonly details: PaymentProviderErrorDetails;

  constructor(details: PaymentProviderErrorDetails) {
    super(details.exceptionMessage);
    this.name = 'PaymentProviderRequestError';
    this.details = details;
  }

  /** Mensagem segura para exibição na tela (sem credenciais). */
  toUserMessage(): string {
    const { failureType } = this.details;
    if (failureType === 'http_error') {
      const status = this.details.status;
      const label = (status !== null && status !== undefined && HTTP_STATUS_LABELS[status]) ?? `HTTP ${status ?? 'desconhecido'}`;
      const body = this.details.responseBody ? ` Resposta: ${this.details.responseBody.slice(0, 300)}` : '';
      return `A operadora respondeu ${label}.${body}`;
    }
    if (failureType === 'timeout') {
      return 'Tempo esgotado ao chamar a operadora (timeout). Verifique a internet e tente de novo.';
    }
    if (failureType === 'network') {
      return `Falha de rede ao chamar a operadora: ${this.details.exceptionMessage}`;
    }
    if (failureType === 'invalid_response') {
      return 'A operadora respondeu em um formato inesperado.';
    }
    return this.details.exceptionMessage;
  }
}
