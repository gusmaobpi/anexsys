import { Inject, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { dispatchDueWhatsapp } from './application/whatsapp.delivery';
import { WhatsappService } from './application/whatsapp.service';
import { PublicWhatsappController } from './http/public-whatsapp.controller';
import { WhatsappController } from './http/whatsapp.controller';

@Injectable()
export class WhatsappDispatchService implements OnModuleInit {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    const timer = setInterval(() => {
      void dispatchDueWhatsapp(this.dataSource).catch(() => undefined);
    }, 60_000);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }
}

@Module({
  imports: [AuditModule],
  controllers: [WhatsappController, PublicWhatsappController],
  providers: [WhatsappService, WhatsappDispatchService],
})
export class WhatsappModule {}
