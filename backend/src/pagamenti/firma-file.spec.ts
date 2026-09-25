import { contenutoCoerente } from './firma-file';

describe('contenutoCoerente', () => {
  it('riconosce i formati ammessi', () => {
    expect(contenutoCoerente(Buffer.from('%PDF-1.7\n'), '.pdf')).toBe(true);
    expect(contenutoCoerente(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), '.JPG')).toBe(true);
    expect(contenutoCoerente(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), '.png')).toBe(true);
    expect(contenutoCoerente(Buffer.from('GIF89a'), '.gif')).toBe(true);
    expect(contenutoCoerente(Buffer.from('RIFF\0\0\0\0WEBP'), '.webp')).toBe(true);
    expect(contenutoCoerente(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]), '.tif')).toBe(true);
  });

  it('respinge contenuti travestiti ed estensioni sconosciute', () => {
    expect(contenutoCoerente(Buffer.from('<html><script>'), '.pdf')).toBe(false);
    expect(contenutoCoerente(Buffer.from('%PDF-1.7'), '.png')).toBe(false);
    expect(contenutoCoerente(Buffer.from('MZ'), '.exe')).toBe(false);
    expect(contenutoCoerente(Buffer.alloc(0), '.pdf')).toBe(false);
  });
});
