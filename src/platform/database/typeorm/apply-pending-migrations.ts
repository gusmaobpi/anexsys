import { DataSource } from 'typeorm';
import { AtelierCatalogAndOsItemFields1760000024000 } from './migrations/1760000024000-atelier-catalog-and-os-item-fields';
import { ServiceOrderPromisedDeliveryTime1760000023000 } from './migrations/1760000023000-service-order-promised-delivery-time';
import { ServiceOrderBags1760000025000 } from './migrations/1760000025000-service-order-bags';
import { ServiceOrderActualDeliveryTime1760000026000 } from './migrations/1760000026000-service-order-actual-delivery-time';
import { ServiceOrderBagClosed1760000027000 } from './migrations/1760000027000-service-order-bag-closed';
import { ServiceOrderItemEquipment1760000028000 } from './migrations/1760000028000-service-order-item-equipment';
import { ServiceOrderQualityStatus1760000029000 } from './migrations/1760000029000-service-order-quality-status';
import { ServiceOrderFloorStatus1760000030000 } from './migrations/1760000030000-service-order-floor-status';
import { ServiceOrderClientReturn1760000031000 } from './migrations/1760000031000-service-order-client-return';
import { ServiceOrderProof1760000032000 } from './migrations/1760000032000-service-order-proof';
import { ServiceOrderProofNotes1760000033000 } from './migrations/1760000033000-service-order-proof-notes';
import { ServiceOrderPickup1760000034000 } from './migrations/1760000034000-service-order-pickup';
import { ServiceOrderPublicToken1760000035000 } from './migrations/1760000035000-service-order-public-token';
import { ServiceOrderApproval1760000036000 } from './migrations/1760000036000-service-order-approval';
import { GarmentProductServices1760000037000 } from './migrations/1760000037000-garment-product-services';
import { OsProcessSuffixes1760000038000 } from './migrations/1760000038000-os-process-suffixes';
import { ServiceOrderItemTimeMinutes1760000039000 } from './migrations/1760000039000-service-order-item-time-minutes';
import { CompanyMinuteRates1760000040000 } from './migrations/1760000040000-company-minute-rates';
import { PaymentProviderConfigs1760000041000 } from './migrations/1760000041000-payment-provider-configs';
import { PaymentTerminals1760000042000 } from './migrations/1760000042000-payment-terminals';
import { PaymentRecordPendingStatus1760000043000 } from './migrations/1760000043000-payment-record-pending-status';
import { PaymentRecordCardFields1760000044000 } from './migrations/1760000044000-payment-record-card-fields';

export async function applyPendingMigrations(dataSource: DataSource): Promise<void> {
  if (typeof dataSource.runMigrations === 'function') {
    try {
      await dataSource.runMigrations();
    } catch {
      // Se o TypeORM não achar o arquivo da migração, o reparo abaixo ainda cria as colunas.
    }
  }

  await ensureAtelierOsSchema(dataSource);
}

export async function ensureAtelierOsSchema(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await new ServiceOrderPromisedDeliveryTime1760000023000().up(queryRunner);
    await new AtelierCatalogAndOsItemFields1760000024000().up(queryRunner);
    await new ServiceOrderBags1760000025000().up(queryRunner);
    await new ServiceOrderActualDeliveryTime1760000026000().up(queryRunner);
    await new ServiceOrderBagClosed1760000027000().up(queryRunner);
    await new ServiceOrderItemEquipment1760000028000().up(queryRunner);
    await new ServiceOrderQualityStatus1760000029000().up(queryRunner);
    await new ServiceOrderFloorStatus1760000030000().up(queryRunner);
    await new ServiceOrderClientReturn1760000031000().up(queryRunner);
    await new ServiceOrderProof1760000032000().up(queryRunner);
    await new ServiceOrderProofNotes1760000033000().up(queryRunner);
    await new ServiceOrderPickup1760000034000().up(queryRunner);
    await new ServiceOrderPublicToken1760000035000().up(queryRunner);
    await new ServiceOrderApproval1760000036000().up(queryRunner);
    await new GarmentProductServices1760000037000().up(queryRunner);
    await new OsProcessSuffixes1760000038000().up(queryRunner);
    await new ServiceOrderItemTimeMinutes1760000039000().up(queryRunner);
    await new CompanyMinuteRates1760000040000().up(queryRunner);
    await new PaymentProviderConfigs1760000041000().up(queryRunner);
    await new PaymentTerminals1760000042000().up(queryRunner);
    await new PaymentRecordPendingStatus1760000043000().up(queryRunner);
    await new PaymentRecordCardFields1760000044000().up(queryRunner);
  } finally {
    await queryRunner.release();
  }
}
