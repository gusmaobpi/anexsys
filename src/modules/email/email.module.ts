import { Module } from '@nestjs/common';
import { AuditModule } from 'src/modules/audit/audit.module';
import { EmailSettingsService } from './application/email-settings.service';
import { EmailSettingsController } from './http/email-settings.controller';

@Module({
  imports: [AuditModule],
  controllers: [EmailSettingsController],
  providers: [EmailSettingsService],
  exports: [EmailSettingsService],
})
export class EmailModule {}
