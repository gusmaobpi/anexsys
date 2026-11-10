import { BadRequestException, Body, Controller, Get, Inject, Patch, UnauthorizedException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentTenantId, CurrentUserId } from 'src/platform/http/request-context.decorators';
import { MessagingChannelsService } from '../application/messaging-channels.service';

class UpdateMessagingChannelsBody {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiToken?: string;

  @IsString()
  @MaxLength(40)
  whatsappSender!: string;

  @IsString()
  @MaxLength(40)
  smsSender!: string;
}

@Controller('messaging/channels')
export class MessagingChannelsController {
  constructor(
    @Inject(MessagingChannelsService)
    private readonly messagingChannelsService: MessagingChannelsService,
  ) {}

  @Permissions('whatsapp.write')
  @Get()
  get(@CurrentTenantId() tenantId: string | null, @CurrentUserId() userId: string | null) {
    const actor = this.requireActor(tenantId, userId);
    return this.messagingChannelsService.getChannels(actor.tenantId, actor.userId);
  }

  @Permissions('whatsapp.write')
  @Patch()
  update(
    @Body() body: UpdateMessagingChannelsBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
  ) {
    const actor = this.requireActor(tenantId, userId);
    return this.messagingChannelsService.updateChannels(actor.tenantId, actor.userId, body);
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
