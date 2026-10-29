import assert from 'node:assert/strict';
import test from 'node:test';
import { BRAND_IMAGE_MAX_BYTES, normalizeBrandImage, readBrandImageUpdate } from '../../src/shared/brand-image';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('a png logo is stored and an empty upload clears it', () => {
  const image = normalizeBrandImage(PNG_1X1);
  assert.equal(image.mimeType, 'image/png');
  assert.equal(readBrandImageUpdate(undefined, undefined), undefined);
  assert.equal(readBrandImageUpdate(null, null), null);
  assert.equal(readBrandImageUpdate('image/png', PNG_1X1)?.mimeType, 'image/png');
});

test('a text file is refused as a brand image', () => {
  assert.throws(() => normalizeBrandImage(Buffer.from('nao e imagem').toString('base64')), /JPG, PNG ou WebP/);
  assert.ok(BRAND_IMAGE_MAX_BYTES > 0);
});
