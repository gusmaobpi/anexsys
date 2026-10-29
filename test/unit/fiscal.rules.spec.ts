import assert from 'node:assert/strict';
import test from 'node:test';
import { certificateAlertDays, fiscalBlockers, paidStatus, type FiscalCheck } from '../../src/modules/fiscal/application/fiscal/fiscal.rules';

function ready(overrides: Partial<FiscalCheck> = {}): FiscalCheck {
  return {
    status: 'picked_up',
    paymentStatus: 'paid',
    alreadyIssued: false,
    customerDocument: '12345678901',
    customerStreet: 'Rua 1',
    customerCity: 'Campinas',
    customerState: 'SP',
    missingServiceCodes: [],
    certificateReady: true,
    settingsReady: true,
    environment: 'homologation',
    ...overrides,
  };
}

test('a finished and paid order can be issued', () => {
  assert.deepEqual(fiscalBlockers(ready()), []);
  assert.deepEqual(fiscalBlockers(ready({ status: 'ready_for_pickup' })), []);
});

test('unfinished, unpaid, issued and incomplete customers stay blocked', () => {
  assert.ok(fiscalBlockers(ready({ status: 'in_production' })).includes('A OS ainda não está concluída.'));
  assert.ok(fiscalBlockers(ready({ paymentStatus: 'pending' })).includes('A OS não está quitada.'));
  assert.ok(fiscalBlockers(ready({ alreadyIssued: true })).includes('A nota desta OS já foi emitida.'));
  assert.ok(fiscalBlockers(ready({ customerDocument: '' })).includes('Cliente sem CPF/CNPJ.'));
  assert.ok(fiscalBlockers(ready({ customerStreet: '' })).includes('Cliente sem endereço.'));
  assert.ok(fiscalBlockers(ready({ missingServiceCodes: ['Barra'] })).includes('Serviço sem código fiscal.'));
  assert.ok(fiscalBlockers(ready({ certificateReady: false })).includes('Certificado inválido.'));
  assert.ok(fiscalBlockers(ready({ environment: null })).includes('Escolha o ambiente fiscal da filial.'));
});

test('certificate alerts use the 90, 60, 30, 15 and 7 day marks', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const days = (count: number) => new Date(now.getTime() + count * 86_400_000);
  assert.equal(certificateAlertDays(days(90), now), 90);
  assert.equal(certificateAlertDays(days(60), now), 60);
  assert.equal(certificateAlertDays(days(30), now), 30);
  assert.equal(certificateAlertDays(days(15), now), 15);
  assert.equal(certificateAlertDays(days(7), now), 7);
  assert.equal(certificateAlertDays(days(3), now), 7);
  assert.equal(certificateAlertDays(days(-1), now), 0);
  assert.equal(certificateAlertDays(days(120), now), null);
});

test('paid status treats a covered total as quitada', () => {
  assert.equal(paidStatus(100, 100), 'paid');
  assert.equal(paidStatus(0, 0), 'paid');
  assert.equal(paidStatus(100, 40), 'partial');
  assert.equal(paidStatus(100, 0), 'pending');
});
