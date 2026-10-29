import { Controller, Get, Header, Headers, Inject, Ip, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from 'src/platform/auth/public.decorator';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { ServiceOrderService } from '../application/service-order/service-order.service';

@Public()
@Controller('public/service-orders')
export class PublicServiceOrdersController {
  constructor(
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
  ) {}

  @Public()
  @Get(':publicToken')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async getTracking(@Param('publicToken') publicToken: string) {
    try {
      return await this.serviceOrderService.getPublicTrackingView(publicToken);
    } catch (error) {
      if (error instanceof EntityNotFoundError || error instanceof DomainValidationError) {
        throw error;
      }
      console.error('[public-os] GET failed', publicToken, error);
      throw error;
    }
  }

  @Public()
  @Post(':publicToken/concordo')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async confirmConcordo(
    @Param('publicToken') publicToken: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
  ) {
    if (!publicToken) {
      throw new UnauthorizedException('O link da OS é obrigatório.');
    }
    try {
      return await this.serviceOrderService.confirmPublicConcordo(publicToken, {
        userAgent: userAgent ?? null,
        ip: ip ?? null,
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError || error instanceof DomainValidationError) {
        throw error;
      }
      console.error('[public-os] POST concordo failed', publicToken, error);
      throw error;
    }
  }

  @Public()
  @Post(':publicToken/recebi')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async confirmRecebi(
    @Param('publicToken') publicToken: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
  ) {
    if (!publicToken) {
      throw new UnauthorizedException('O link da OS é obrigatório.');
    }
    try {
      return await this.serviceOrderService.confirmPublicRecebi(publicToken, {
        userAgent: userAgent ?? null,
        ip: ip ?? null,
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError || error instanceof DomainValidationError) {
        throw error;
      }
      console.error('[public-os] POST recebi failed', publicToken, error);
      throw error;
    }
  }
}
