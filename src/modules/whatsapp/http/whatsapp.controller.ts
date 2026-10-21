import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UnauthorizedException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { WhatsappService } from '../application/whatsapp.service';

class UpdateWhatsappSettingsBody {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneDisplay?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  wabaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessToken?: string;

  @IsOptional()
  @IsIn(['test', 'production'])
  environment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  retryIntervalMinutes?: number;

  @IsOptional()
  @IsString()
  sendWindowStart?: string;

  @IsOptional()
  @IsString()
  sendWindowEnd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  consentText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  publicLinkOrigin?: string;
}

class UpdateWhatsappTemplateBody {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  metaName?: string;
}

class TestWhatsappBody {
  @IsString()
  @MaxLength(40)
  phone!: string;
}

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    @Inject(WhatsappService)
    private readonly whatsappService: WhatsappService,
  ) {}

  @Permissions('whatsapp.write')
  @Get('settings')
  settings(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.whatsappService.getSettings(tenantId as string, principal.userId);
  }

  @Permissions('customers.read')
  @Get('consent-text')
  consentText(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.whatsappService.consentText(tenantId as string, principal.userId);
  }

  @Permissions('whatsapp.write')
  @Patch('settings')
  updateSettings(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Body() body: UpdateWhatsappSettingsBody,
  ) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.whatsappService.updateSettings(tenantId as string, principal.userId, body);
  }

  @Permissions('whatsapp.write')
  @Patch('templates/:code')
  updateTemplate(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Param('code') code: string,
    @Body() body: UpdateWhatsappTemplateBody,
  ) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.whatsappService.updateTemplate(tenantId as string, principal.userId, code, body);
  }

  @Permissions('whatsapp.write')
  @Post('templates/:code/submit')
  submit(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Param('code') code: string,
  ) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.whatsappService.submitTemplate(tenantId as string, principal.userId, code);
  }

  @Permissions('whatsapp.write')
  @Post('templates/:code/refresh')
  refresh(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Param('code') code: string,
  ) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.whatsappService.refreshTemplate(tenantId as string, principal.userId, code);
  }

  @Permissions('whatsapp.write')
  @Post('templates/:code/test')
  test(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Param('code') code: string,
    @Body() body: TestWhatsappBody,
  ) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.whatsappService.testTemplate(tenantId as string, principal.userId, code, body.phone);
  }

  @Permissions('whatsapp.read')
  @Get('messages')
  messages(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('status') status?: string,
  ) {
    this.requirePrincipal(tenantId, request);
    return this.whatsappService.listMessages(tenantId as string, status);
  }

  @Permissions('whatsapp.resend')
  @Post('messages/:id/resend')
  resend(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Param('id') id: string,
  ) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.whatsappService.resend(tenantId as string, principal.userId, id);
  }

  @Permissions('whatsapp.write')
  @Post('dispatch')
  dispatch(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    this.requirePrincipal(tenantId, request);
    return this.whatsappService.dispatch(tenantId as string);
  }

  private requirePrincipal(tenantId: string | null, request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    return principal;
  }
}
