import { Injectable } from '@nestjs/common';
import { PaymentProviderName } from 'src/shared/domain/enums';
import { PaymentProviderAdapter } from '../../contracts/provider/payment-provider.contract';

@Injectable()
export class PaymentProviderRegistry {
  private readonly adapters = new Map<PaymentProviderName, PaymentProviderAdapter>();

  register(adapter: PaymentProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  getAdapter(provider: PaymentProviderName): PaymentProviderAdapter | null {
    return this.adapters.get(provider) ?? null;
  }
}
