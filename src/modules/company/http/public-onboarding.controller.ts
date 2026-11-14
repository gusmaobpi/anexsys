import { Body, Controller, Header, Inject, Post } from '@nestjs/common';
import { Public } from 'src/platform/auth/public.decorator';
import { PublicOnboardingService } from '../application/company/public-onboarding.service';

@Public()
@Controller('public/onboarding')
export class PublicOnboardingController {
  constructor(
    @Inject(PublicOnboardingService)
    private readonly onboardingService: PublicOnboardingService,
  ) {}

  @Public()
  @Post('request-token')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async requestToken(
    @Body()
    body: {
      companyName?: string;
      cnpj?: string | null;
      adminName?: string;
      email?: string;
      phone?: string;
      password?: string;
    },
  ) {
    return this.onboardingService.requestToken({
      companyName: body?.companyName ?? '',
      cnpj: body?.cnpj ?? null,
      adminName: body?.adminName ?? '',
      email: body?.email ?? '',
      phone: body?.phone ?? '',
      password: body?.password ?? '',
    });
  }

  @Public()
  @Post('verify-token')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async verifyToken(
    @Body()
    body: {
      registrationId?: string;
      code?: string;
    },
  ) {
    return this.onboardingService.verifyTokenAndProvision({
      registrationId: body?.registrationId ?? '',
      code: body?.code ?? '',
    });
  }
}
