import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { problemiPassword } from './politica-password';
import { ChangePasswordDto } from './dto/change-password.dto';
import { verificaSegreti } from '../configura-app';

describe('politica delle password', () => {
  it.each(['Tassa#Automobilistica-42', 'Q9!vR2@pL7#mZ4$k', 'Studio-Rossi_Scadenze.2026'])(
    'accetta %p',
    (password) => {
      expect(problemiPassword(password, 'mario.bianchi@studio.it')).toEqual([]);
    },
  );

  it.each([
    ['Corta1!a', /Almeno 12 caratteri/],
    ['senzamaiuscole-2026!', /maiuscola/],
    ['SENZAMINUSCOLE-2026!', /minuscola/],
    ['SenzaNumeri-Studio!', /numero/],
    ['SenzaSimboli2026Studio', /simbolo/],
    ['Aaaaa-Studio-2026!', /ripetuto/],
    ['MiaPassword-2026!', /parola ovvia/],
    ['Admin-Studio-2026!', /parola ovvia/],
    ['Qwerty-Studio-2026!', /parola ovvia/],
  ])('rifiuta %p', (password, motivo) => {
    expect(problemiPassword(password).join(' ')).toMatch(motivo);
  });

  it('rifiuta una password che contiene il nome dell\'email', () => {
    expect(problemiPassword('Mario.Bianchi-2026!', 'mario.bianchi@studio.it')).toContain(
      'Non deve contenere il nome dell\'indirizzo email',
    );
    // Nomi di 1-2 lettere sarebbero troppo restrittivi: non si controllano.
    expect(problemiPassword('Tassa#Automobilistica-42', 'ab@studio.it')).toEqual([]);
  });

  it('rifiuta password oltre 128 caratteri (bcrypt ignora il resto)', () => {
    expect(problemiPassword('Aa1!' + 'x'.repeat(130)).join(' ')).toMatch(/Al massimo 128/);
  });

  it('elenca tutti i problemi insieme, per correggerli in una volta', () => {
    expect(problemiPassword('abc').length).toBeGreaterThanOrEqual(4);
  });

  it('il DTO di cambio password applica la politica', async () => {
    const errori = await validate(plainToInstance(ChangePasswordDto, { currentPassword: 'x', newPassword: 'debole' }));
    expect(JSON.stringify(errori)).toMatch(/Password non abbastanza sicura/);
    expect(
      await validate(plainToInstance(ChangePasswordDto, { currentPassword: 'x', newPassword: 'Tassa#Automobilistica-42' })),
    ).toEqual([]);
  });
});

describe('verificaSegreti', () => {
  it('in produzione rifiuta un JWT_SECRET assente, corto o d\'esempio', () => {
    expect(() => verificaSegreti({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => verificaSegreti({ NODE_ENV: 'production', JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
    expect(() =>
      verificaSegreti({ NODE_ENV: 'production', JWT_SECRET: 'your-production-secret-key-change-me' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('accetta un segreto robusto, e non blocca lo sviluppo', () => {
    expect(() => verificaSegreti({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48) })).not.toThrow();
    expect(() => verificaSegreti({ NODE_ENV: 'development' })).not.toThrow();
  });
});
