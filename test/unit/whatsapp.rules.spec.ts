import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  minutesUntilSendWindow,
  renderWhatsappBody,
  unknownWhatsappVariable,
  whatsappMetaBody,
  whatsappParameterValues,
} from 'src/modules/whatsapp/application/whatsapp.rules';

describe('whatsapp message text', () => {
  it('rejects a variable that is not on the screen', () => {
    assert.equal(unknownWhatsappVariable('Olá, {apelido}'), '{apelido}');
    assert.equal(unknownWhatsappVariable('Olá, {primeiro_nome}'), null);
  });

  it('turns the screen tokens into the Meta order', () => {
    const body = 'Olá, {primeiro_nome}. OS {numero_os}. {link}';
    assert.deepEqual(whatsappMetaBody(body), {
      text: 'Olá, {{1}}. OS {{2}}. {{3}}',
      keys: ['primeiro_nome', 'numero_os', 'link'],
    });
    assert.deepEqual(
      whatsappParameterValues(body, {
        primeiro_nome: 'Maria',
        numero_os: 'AAA000001',
        link: 'https://atelier.exemplo/os/1',
      }),
      ['Maria', 'AAA000001', 'https://atelier.exemplo/os/1'],
    );
  });

  it('fills the preview and waits outside the send window', () => {
    assert.equal(renderWhatsappBody('Olá, {primeiro_nome}', { primeiro_nome: 'Ana' }), 'Olá, Ana');
    assert.equal(minutesUntilSendWindow(10 * 60, 9 * 60, 18 * 60), null);
    assert.equal(minutesUntilSendWindow(8 * 60, 9 * 60, 18 * 60), 60);
    assert.equal(minutesUntilSendWindow(19 * 60, 9 * 60, 18 * 60), 14 * 60);
  });
});
