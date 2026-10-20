import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cieloPaymentCode, mapOperatorProductToModality, modalitiesDiverge } from 'src/modules/finance/application/finance/payment-modality';
import { PaymentModality } from 'src/shared/domain/enums';

describe('payment modality', () => {
  it('maps the operator product without treating it as the card brand', () => {
    assert.equal(mapOperatorProductToModality('CREDIT'), PaymentModality.CREDIT);
    assert.equal(mapOperatorProductToModality('debit'), PaymentModality.DEBIT);
    assert.equal(mapOperatorProductToModality('PIX'), PaymentModality.PIX);
    assert.equal(mapOperatorProductToModality('VOUCHER'), PaymentModality.VOUCHER);
    assert.equal(mapOperatorProductToModality('CREDITO'), PaymentModality.CREDIT);
    assert.equal(mapOperatorProductToModality('DEBITO_AVISTA'), PaymentModality.DEBIT);
    assert.equal(mapOperatorProductToModality('PRIVATE LABEL'), null);
    assert.equal(cieloPaymentCode('credit'), 'CREDITO_AVISTA');
    assert.equal(cieloPaymentCode('debit'), 'DEBITO_AVISTA');
    assert.equal(cieloPaymentCode('pix'), 'PIX');
    assert.equal(cieloPaymentCode('cash'), null);
  });

  it('detects divergence and keeps both sides comparable', () => {
    assert.equal(modalitiesDiverge(PaymentModality.CREDIT, PaymentModality.DEBIT), true);
    assert.equal(modalitiesDiverge(PaymentModality.CREDIT, PaymentModality.CREDIT), false);
    assert.equal(modalitiesDiverge(PaymentModality.CREDIT, null), false);
  });
});
