import { Module } from '@nestjs/common';
import { AuditModule } from 'src/modules/audit/audit.module';
import { MessagingChannelsService } from './application/messaging-channels.service';
import { MessagingChannelsController } from './http/messaging-channels.controller';

@Module({
  imports: [AuditModule],
  controllers: [MessagingChannelsController],
  providers: [MessagingChannelsService],
  exports: [MessagingChannelsService],
})
export class MessagingModule {}
