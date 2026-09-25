import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { classificaValutazione } from './classifica';
import { ImpostaCampoDto } from './dto/imposta-campo.dto';
import { TESTO_ASSUNZIONE } from '../bollo/motore';
import { ALIMENTAZIONI, CLASSI_AMBIENTALI, REGIONI, TIPI_SOSPENSIONE, TIPI_VEICOLO } from '../veicoli/domini';
import { UpdateVeicoloDto } from '../veicoli/dto/update-veicolo.dto';
import { CreateVeicoloDto } from '../veicoli/dto/create-veicolo.dto';

describe('classificaValutazione', () => {
  it('separa i dati mancanti dai problemi del tariffario', () => {
    const c = classificaValutazione({
      motivi: [
        { codice: 'DATO_MANCANTE', campo: 'potenzaKw', messaggio: 'Dato mancante: potenza (KW).' },
        { codice: 'DATO_MANCANTE', campo: 'classeAmbientale', messaggio: 'Dato mancante: classe ambientale.' },
        { codice: 'TARIFFA_MANCANTE', messaggio: 'Il tariffario non contiene tariffe per X.' },
      ],
      assunzioni: [],
    });

    expect(c.mancanti.map((m) => [m.campo, m.motivo])).toEqual([
      ['potenzaKw', 'MANCANTE'],
      ['classeAmbientale', 'MANCANTE'],
    ]);
    expect(c.mancanti[0].doveTrovarlo).toMatch(/P\.2/);
    expect(c.mancanti[0].etichetta).toBe('potenza (KW)');
    expect(c.tariffario).toEqual(['Il tariffario non contiene tariffe per X.']);
    expect(c.consigliati).toEqual([]);
  });

  it('distingue un valore non valido e un tipo da riclassificare', () => {
    const c = classificaValutazione({
      motivi: [
        { codice: 'TIPO_NON_GESTITO', campo: 'tipoVeicolo', messaggio: 'Nessuna regola per "Motrice".' },
        { codice: 'DATO_NON_VALIDO', campo: 'classeAmbientale', messaggio: 'Classe non riconosciuta.' },
      ],
      assunzioni: [],
    });
    expect(c.mancanti.map((m) => m.motivo)).toEqual(['DA_RICLASSIFICARE', 'NON_VALIDO']);
  });

  it('un campo con più motivi compare una volta sola', () => {
    const c = classificaValutazione({
      motivi: [
        { codice: 'DATO_MANCANTE', campo: 'pesoComplessivoKg', messaggio: 'a' },
        { codice: 'DATO_NON_VALIDO', campo: 'pesoComplessivoKg', messaggio: 'b' },
      ],
      assunzioni: [],
    });
    expect(c.mancanti).toHaveLength(1);
  });

  it('la regione senza tariffario è un problema del tariffario, non del veicolo', () => {
    const c = classificaValutazione({
      motivi: [{ codice: 'TARIFFARIO_ASSENTE', campo: 'regione', messaggio: 'Nessun tariffario per Veneto.' }],
      assunzioni: [],
    });
    expect(c.mancanti).toEqual([]);
    expect(c.tariffario).toHaveLength(1);
  });

  it('ricava i dati consigliati dalle assunzioni del motore', () => {
    const c = classificaValutazione({
      motivi: [],
      assunzioni: [TESTO_ASSUNZIONE.alimentazione, TESTO_ASSUNZIONE.dataImmatricolazione],
    });
    expect(c.consigliati.map((x) => x.campo)).toEqual(['alimentazione', 'dataImmatricolazione']);
    expect(c.consigliati[1].doveTrovarlo).toMatch(/riquadro B/);
  });
});

describe('domini dei veicoli', () => {
  // I domini dell'API devono coincidere con i vincoli del database: se
  // divergono, l'API accetta un valore che il database rifiuta con un 500.
  const sql = readFileSync(
    join(__dirname, '../../prisma/migrations/20260922000003_vincoli_dominio_veicoli/migration.sql'),
    'utf-8',
  );
  const dominio = (vincolo: string) => {
    const blocco = sql.slice(sql.indexOf(`"${vincolo}"`), sql.indexOf(');', sql.indexOf(`"${vincolo}"`)));
    return [...blocco.matchAll(/'((?:[^']|'')+)'/g)].map((m) => m[1].replace(/''/g, "'"));
  };

  it.each([
    ['veicoli_tipo_veicolo_valido', TIPI_VEICOLO],
    ['veicoli_classe_ambientale_valida', CLASSI_AMBIENTALI],
    ['veicoli_alimentazione_valida', ALIMENTAZIONI],
    ['veicoli_tipo_sospensione_valido', TIPI_SOSPENSIONE],
    ['veicoli_regione_valida', REGIONI],
  ])('%s coincide con il vincolo del database', (vincolo, valori) => {
    expect([...valori].sort()).toEqual(dominio(vincolo).sort());
  });
});

describe('validazione dei dati del veicolo', () => {
  async function errori<T extends object>(classe: new () => T, dati: object) {
    const risultato = await validate(plainToInstance(classe, dati), { whitelist: true });
    return risultato.flatMap((e) => Object.values(e.constraints ?? {}));
  }

  it('rifiuta valori fuori dominio con un messaggio che li elenca', async () => {
    const msg = await errori(UpdateVeicoloDto, { classeAmbientale: 'EURO 6' });
    expect(msg).toHaveLength(1);
    expect(msg[0]).toMatch(/classeAmbientale: valore "EURO 6" non ammesso/);
    expect(msg[0]).toContain('Euro 6d-TEMP');
  });

  it('rifiuta zero e negativi nelle grandezze fisiche', async () => {
    expect(await errori(UpdateVeicoloDto, { potenzaKw: 0 })).toHaveLength(1);
    expect(await errori(UpdateVeicoloDto, { pesoComplessivoKg: -1 })).toHaveLength(1);
    expect(await errori(CreateVeicoloDto, { idCliente: 1, targa: 'AB123CD', numeroAssi: 0 })).toHaveLength(1);
  });

  it('accetta valori validi e null per svuotare un campo', async () => {
    expect(
      await errori(UpdateVeicoloDto, {
        tipoVeicolo: 'Autocarro',
        classeAmbientale: 'Euro 6',
        regione: "Valle d'Aosta",
        potenzaKw: 85.5,
        numeroAssi: 3,
      }),
    ).toEqual([]);
    expect(await errori(UpdateVeicoloDto, { potenzaKw: null, classeAmbientale: null })).toEqual([]);
  });

  it('ammette i tipi dell\'archivio da riclassificare, per poter modificare gli altri dati', async () => {
    expect(await errori(UpdateVeicoloDto, { tipoVeicolo: 'Motrice' })).toEqual([]);
  });
});

describe('ImpostaCampoDto', () => {
  async function errori(dati: object) {
    const risultato = await validate(plainToInstance(ImpostaCampoDto, dati));
    return risultato.flatMap((e) => Object.values(e.constraints ?? {}));
  }

  it('accetta un valore del dominio del campo', async () => {
    expect(await errori({ idVeicoli: [1, 2], campo: 'tipoVeicolo', valore: 'Semirimorchio' })).toEqual([]);
    expect(await errori({ idVeicoli: [1], campo: 'tipoSospensione', valore: 'Pneumatiche' })).toEqual([]);
  });

  it('rifiuta un valore di un altro dominio o da riclassificare', async () => {
    expect(await errori({ idVeicoli: [1], campo: 'tipoVeicolo', valore: 'Euro 6' })).toHaveLength(1);
    expect(await errori({ idVeicoli: [1], campo: 'tipoVeicolo', valore: 'Motrice' })).toHaveLength(1);
  });

  it('non permette di impostare in blocco grandezze proprie di ciascun mezzo', async () => {
    expect(await errori({ idVeicoli: [1], campo: 'potenzaKw', valore: '100' })).not.toEqual([]);
  });

  it('limita il numero di veicoli per operazione', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);
    expect(await errori({ idVeicoli: ids, campo: 'regione', valore: 'Lombardia' })).toHaveLength(1);
    expect(await errori({ idVeicoli: [], campo: 'regione', valore: 'Lombardia' })).toHaveLength(1);
  });
});
