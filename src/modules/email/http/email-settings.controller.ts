import { BadRequestException, Body, Controller, Get, Inject, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentTenantId, CurrentUserId } from 'src/platform/http/request-context.decorators';
import { EmailSettingsService } from '../application/email-settings.service';

class UpdateEmailSettingsBody {
  @IsString()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsIn(['none', 'starttls', 'ssl'])
  security!: string;

  @IsString()
  username!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsString()
  fromName!: string;

  @IsString()
  fromAddress!: string;

  @IsString()
  publicLinkOrigin!: string;
}

@Controller('email/settings')
export class EmailSettingsController {
  constructor(
    @Inject(EmailSettingsService)
    private readonly emailSettingsService: EmailSettingsService,
  ) {}

  @Permissions('email.write')
  @Get()
  get(@CurrentTenantId() tenantId: string | null, @CurrentUserId() userId: string | null) {
    const actor = this.requireActor(tenantId, userId);
    return this.emailSettingsService.getSettings(actor.tenantId, actor.userId);
  }

  @Permissions('email.write')
  @Patch()
  update(
    @Body() body: UpdateEmailSettingsBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
  ) {
    const actor = this.requireActor(tenantId, userId);
    return this.emailSettingsService.updateSettings(actor.tenantId, actor.userId, body);
  }

  @Permissions('email.write')
  @Post('test')
  test(@CurrentTenantId() tenantId: string | null, @CurrentUserId() userId: string | null) {
    const actor = this.requireActor(tenantId, userId);
    return this.emailSettingsService.testSend(actor.tenantId, actor.userId);
  }

  private requireActor(tenantId: string | null, userId: string | null) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }
    return { tenantId, userId };
  }
}
