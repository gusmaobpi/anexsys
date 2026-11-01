import { Module } from '@nestjs/common';
import { AuditModule } from 'src/modules/audit/audit.module';
import { PrivacyService } from './application/privacy.service';
import { PrivacyController } from './http/privacy.controller';

@Module({
  imports: [AuditModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
