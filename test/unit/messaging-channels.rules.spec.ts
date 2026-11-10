import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { normalizeSmsSender, normalizeWhatsappSender, normalizeZenviaToken } from 'src/modules/messaging/application/messaging-channels.rules';
import { zenviaWhatsappTextBody } from 'src/modules/messaging/application/zenvia-whatsapp';

describe('messaging channel rules', () => {
  it('keeps the stored Zenvia token when the field is left blank', () => {
    assert.equal(normalizeZenviaToken('', 'token-atual'), 'token-atual');
    assert.equal(normalizeZenviaToken('  novo-token  ', 'token-atual'), 'novo-token');
  });

  it('stores the WhatsApp sender as digits or as the sandbox keyword', () => {
    assert.equal(normalizeWhatsappSender('+55 (11) 98888-7777'), '5511988887777');
    assert.equal(normalizeWhatsappSender(''), '');
    assert.equal(normalizeWhatsappSender(' keyword-sandbox '), 'keyword-sandbox');
  });

  it('rejects a WhatsApp sender without DDD', () => {
    assert.throws(() => normalizeWhatsappSender('988887777'), DomainValidationError);
  });

  it('builds the Zenvia text message', () => {
    assert.deepEqual(zenviaWhatsappTextBody('keyword-sandbox', '5511988887777', 'pronta para retirada'), {
      from: 'keyword-sandbox',
      to: '5511988887777',
      contents: [{ type: 'text', text: 'pronta para retirada' }],
    });
  });

  it('accepts an SMS sender name', () => {
    assert.equal(normalizeSmsSender(' Ateliê '), 'Ateliê');
    assert.equal(normalizeSmsSender(''), '');
  });
});
