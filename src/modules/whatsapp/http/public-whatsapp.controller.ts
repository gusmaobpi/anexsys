import { Body, Controller, Get, Header, Inject, Post, Query, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from 'src/platform/auth/public.decorator';
import { applyWhatsappWebhook, verifyWhatsappWebhook } from '../application/whatsapp.delivery';

@Public()
@Controller('public/whatsapp')
export class PublicWhatsappController {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
  ) {}

  @Get('webhook')
  @Header('Content-Type', 'text/plain')
  async verify(
    @Query('hub.mode') mode = '',
    @Query('hub.verify_token') token = '',
    @Query('hub.challenge') challenge = '',
  ) {
    const accepted = await verifyWhatsappWebhook(this.dataSource, mode, token, challenge);
    if (!accepted) {
      throw new UnauthorizedException('Webhook do WhatsApp recusado.');
    }
    return accepted;
  }

  @Post('webhook')
  async receive(@Body() body: Record<string, unknown>) {
    await applyWhatsappWebhook(this.dataSource, body);
    return { received: true };
  }
}
