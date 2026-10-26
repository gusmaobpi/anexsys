import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticationFailedError } from 'src/shared/errors/authentication-failed.error';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest<{ method?: string; url?: string }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        response.status(status).json({ message: this.photoTooLargeMessage() });
        return;
      }
      const friendlyMessage = this.getFriendlyHttpMessage(status, exception.getResponse(), request);
      response.status(status).json(friendlyMessage ? { message: friendlyMessage } : this.localizePayload(exception.getResponse()));
      return;
    }

    if (/entity too large|PayloadTooLarge/i.test(exception instanceof Error ? exception.message : '')) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({ message: this.photoTooLargeMessage() });
      return;
    }

    if (exception instanceof DomainValidationError || exception instanceof BadRequestException) {
      response.status(HttpStatus.BAD_REQUEST).json({ message: this.localize(exception.message) });
      return;
    }

    if (exception instanceof EntityNotFoundError || exception instanceof NotFoundException) {
      response.status(HttpStatus.NOT_FOUND).json({ message: this.localize(exception.message) });
      return;
    }

    if (exception instanceof AuthenticationFailedError || exception instanceof UnauthorizedException) {
      response.status(HttpStatus.UNAUTHORIZED).json({ message: this.localize(exception.message) });
      return;
    }

    if (exception instanceof ForbiddenException) {
      response.status(HttpStatus.FORBIDDEN).json({ message: this.localize(exception.message) });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: this.getFriendlyServerMessage(exception),
    });
  }

  private getFriendlyServerMessage(exception: unknown): string {
    const raw = exception instanceof Error ? exception.message : '';
    if (/getAllAndOverride|assertAllowed|Cannot read properties of undefined/.test(raw)) {
      return 'O servidor não concluiu a operação. Pare o processo da porta 3000, rode npm run start:dev outra vez e tente de novo.';
    }
    if (/coluna .+ não existe|column .+ does not exist/i.test(raw)) {
      return 'O banco local está incompleto. No VS Code, no terminal do start:dev, aperte Ctrl+C e rode npm run start:dev de novo.';
    }
    return this.localize(raw) || 'Erro interno do servidor.';
  }

  private localizePayload(payload: unknown): unknown {
    if (typeof payload === 'string') return this.localize(payload);
    if (!payload || typeof payload !== 'object' || !('message' in payload)) return payload;
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') return { ...payload, message: this.localize(message) };
    if (Array.isArray(message)) {
      return { ...payload, message: message.map((item) => (typeof item === 'string' ? this.localize(item) : item)) };
    }
    return payload;
  }

  private localize(message: string): string {
    const exact: Record<string, string> = {
      'Authenticated tenant context is required.': 'É preciso estar autenticado na conta.',
      'Authenticated user is required.': 'É preciso estar autenticado.',
      'Authenticated session is required.': 'É preciso estar com a sessão ativa.',
      'Authenticated permission context is required.': 'É preciso estar autenticado para verificar a permissão.',
      'Authorization bearer token is required.': 'É preciso enviar o token de acesso.',
      'Tenant context is required.': 'É preciso selecionar a conta.',
      'Branch context is required.': 'É preciso selecionar a filial.',
      'Requested branch is outside the authenticated branch scope.': 'A filial pedida está fora do seu acesso.',
      'Requested branch is outside the authenticated tenant scope.': 'A filial pedida está fora da conta autenticada.',
      'Requested branch is outside the authenticated access scope.': 'A filial pedida está fora do seu acesso.',
      'Requested user is outside the authenticated tenant scope.': 'Este usuário está fora da conta autenticada.',
      'Requested community is outside the authenticated tenant scope.': 'Esta comunidade está fora da conta autenticada.',
      'Requested permission is outside the authenticated tenant scope.': 'Esta permissão está fora da conta autenticada.',
      'Requested role is outside the authenticated tenant scope.': 'Este papel está fora da conta autenticada.',
      'Requested tenant is outside the authenticated tenant scope.': 'Esta conta está fora do acesso autenticado.',
      'Requested company is outside the authenticated access scope.': 'A empresa pedida está fora do seu acesso.',
      'Requested service order is outside the authenticated branch scope.': 'Esta ordem de serviço está fora da filial autenticada.',
      'Requested production order is outside the authenticated branch scope.': 'Esta ordem de produção está fora da filial autenticada.',
      'Requested operational resource is outside the authenticated branch scope.': 'Este recurso está fora da filial autenticada.',
      'Authenticated user is outside the tenant scope.': 'O usuário autenticado está fora da conta.',
      'User is outside the tenant scope.': 'Este usuário está fora da conta.',
      'Role is outside the tenant scope.': 'Este papel está fora da conta.',
      'Permission is outside the tenant scope.': 'Esta permissão está fora da conta.',
      'Community is outside the tenant scope.': 'Esta comunidade está fora da conta.',
      'Portal user is outside the tenant scope.': 'Este usuário do portal está fora da conta.',
      'Branch must belong to the same tenant.': 'A filial precisa pertencer à mesma conta.',
      'Internal server error': 'Erro interno do servidor.',
      'Bad Request': 'Solicitação inválida.',
      'Unauthorized': 'Não autorizado.',
      'Forbidden': 'Sem permissão.',
      'Not Found': 'Não encontrado.',
    };
    const known = exact[message];
    if (known) return known;
    const permission = message.match(/^Missing required permission '(.+)'\.$/);
    if (permission) return `Falta a permissão '${permission[1]}'.`;
    const action = message.match(/^Unsupported dependency validation action '(.+)'\.$/);
    if (action) return `Ação de validação desconhecida: '${action[1]}'.`;
    if (/ was not found\.$/.test(message)) return 'O registro pedido não foi encontrado.';
    if (/ is outside the /.test(message)) return 'Este registro está fora do seu acesso.';
    if (/outside the allowed warranty period/.test(message)) return 'Este caso está fora do prazo de garantia.';
    return message;
  }

  private getFriendlyHttpMessage(
    status: number,
    payload: unknown,
    request: { method?: string; url?: string } | undefined,
  ): string | null {
    if (status !== HttpStatus.BAD_REQUEST || !payload || typeof payload !== 'object') {
      return null;
    }

    const message = (payload as { message?: unknown }).message;
    if (!Array.isArray(message)) {
      return null;
    }

    if (request?.method === 'POST' && request.url?.includes('/customers')) {
      return 'Não foi possível gravar o cliente. Algum campo do cadastro está faltando ou inválido. Revise nome, contato, endereço e documento e tente de novo.';
    }

    return 'Não foi possível concluir a solicitação. Algum campo informado está faltando ou inválido. Revise os dados e tente de novo.';
  }

  private photoTooLargeMessage() {
    return 'A foto ficou grande demais para enviar. O sistema já reduz a imagem; tire outra um pouco mais de perto.';
  }
}
