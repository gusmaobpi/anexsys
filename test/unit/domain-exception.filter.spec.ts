import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { DomainExceptionFilter } from 'src/platform/http/domain-exception.filter';

function createHost(request: { method?: string; url?: string } = {}) {
  const result: { statusCode?: number; body?: unknown } = {};
  const response = {
    status(statusCode: number) {
      result.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  };

  return {
    result,
    host: {
      switchToHttp() {
        return {
          getResponse() {
            return response;
          },
          getRequest() {
            return request;
          },
        };
      },
    },
  };
}

describe('DomainExceptionFilter', () => {
  it('replaces customer validation arrays with a business-friendly message', () => {
    const { host, result } = createHost({ method: 'POST', url: '/api/v1/customers' });

    new DomainExceptionFilter().catch(
      new BadRequestException(['property street should not exist', 'property city should not exist']),
      host as never,
    );

    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body, {
      message:
        'Não foi possível gravar o cliente. Algum campo do cadastro está faltando ou inválido. Revise nome, contato, endereço e documento e tente de novo.',
    });
  });

  it('preserves explicit business bad-request messages', () => {
    const { host, result } = createHost({ method: 'PATCH', url: '/api/v1/customers/customer-1' });

    new DomainExceptionFilter().catch(
      new BadRequestException('A gestão de cliente bloqueado ainda não está disponível nesta tela.'),
      host as never,
    );

    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body, {
      error: 'Bad Request',
      message: 'A gestão de cliente bloqueado ainda não está disponível nesta tela.',
      statusCode: 400,
    });
  });

  it('translates the tsx Reflector login crash into a recoverable message', () => {
    const { host, result } = createHost({ method: 'POST', url: '/api/v1/auth/login/password' });

    new DomainExceptionFilter().catch(
      new TypeError("Cannot read properties of undefined (reading 'getAllAndOverride')"),
      host as never,
    );

    assert.equal(result.statusCode, 500);
    assert.match(String((result.body as { message?: string }).message), /start:dev/);
  });

  it('translates the tsx login limiter crash into a recoverable message', () => {
    const { host, result } = createHost({ method: 'POST', url: '/api/v1/auth/login/password' });

    new DomainExceptionFilter().catch(
      new TypeError("Cannot read properties of undefined (reading 'assertAllowed')"),
      host as never,
    );

    assert.equal(result.statusCode, 500);
    assert.match(String((result.body as { message?: string }).message), /start:dev/);
  });

  it('translates a missing database column into a recoverable start:dev message', () => {
    const { host, result } = createHost({ method: 'GET', url: '/api/v1/service-orders' });

    new DomainExceptionFilter().catch(
      new Error('coluna service_order.promised_delivery_time não existe'),
      host as never,
    );

    assert.equal(result.statusCode, 500);
    assert.match(String((result.body as { message?: string }).message), /banco local está incompleto/);
    assert.match(String((result.body as { message?: string }).message), /start:dev/);
  });

  it('translates a photo that exceeds the JSON body limit', () => {
    const { host, result } = createHost({ method: 'POST', url: '/api/v1/service-orders/so-1/approval' });

    new DomainExceptionFilter().catch(new PayloadTooLargeException('request entity too large'), host as never);

    assert.equal(result.statusCode, 413);
    assert.match(String((result.body as { message?: string }).message), /foto ficou grande demais/);

    new DomainExceptionFilter().catch(Object.assign(new Error('request entity too large'), { status: 413 }), host as never);
    assert.equal(result.statusCode, 413);
    assert.match(String((result.body as { message?: string }).message), /foto ficou grande demais/);
  });

  it('translates a tsx customer search crash into a recoverable message', () => {
    const { host, result } = createHost({ method: 'GET', url: '/api/v1/customers' });

    new DomainExceptionFilter().catch(
      new TypeError("Cannot read properties of undefined (reading 'search')"),
      host as never,
    );

    assert.equal(result.statusCode, 500);
    assert.match(String((result.body as { message?: string }).message), /start:dev/);
  });
});
