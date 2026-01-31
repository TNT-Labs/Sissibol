const { PrismaClient, Ruolo } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

/**
 * Seed delle tariffe bollo Regione Lombardia 2026
 * Basato sul tariffario ufficiale L.R. 14 Luglio 2003, n. 10
 */
async function seedTariffeLombardia2026() {
  console.log('📋 Inserimento tariffe Lombardia 2026...');

  // Verifica se esistono già configurazioni per il 2026
  const existingConfig = await prisma.configurazioneBollo.findFirst({
    where: {
      annoValidita: 2026,
      regione: 'Lombardia',
    },
  });

  if (existingConfig) {
    console.log('✅ Tariffe Lombardia 2026 già esistenti');
    return;
  }

  // Crea configurazione Lombardia 2026
  const config = await prisma.configurazioneBollo.create({
    data: {
      annoValidita: 2026,
      regione: 'Lombardia',
      scontoRid: 15, // 15% sconto domiciliazione bancaria
      attivo: true,
      note: 'Tariffario Regione Lombardia - L.R. 14 Luglio 2003, n. 10',
    },
  });

  console.log(`Configurazione creata: ID ${config.id}`);

  // =====================================================
  // AUTOVETTURE E AUTOVEICOLI USO PROMISCUO
  // =====================================================
  const tariffeAutovetture = [
    // Euro 0
    { categoriaEuro: 'Euro 0', sogliaMin: 0, sogliaMax: 100, importoUnitario: 3.00 },
    { categoriaEuro: 'Euro 0', sogliaMin: 100, sogliaMax: null, importoUnitario: 4.50 },
    // Euro 1
    { categoriaEuro: 'Euro 1', sogliaMin: 0, sogliaMax: 100, importoUnitario: 2.90 },
    { categoriaEuro: 'Euro 1', sogliaMin: 100, sogliaMax: null, importoUnitario: 4.35 },
    // Euro 2
    { categoriaEuro: 'Euro 2', sogliaMin: 0, sogliaMax: 100, importoUnitario: 2.80 },
    { categoriaEuro: 'Euro 2', sogliaMin: 100, sogliaMax: null, importoUnitario: 4.20 },
    // Euro 3
    { categoriaEuro: 'Euro 3', sogliaMin: 0, sogliaMax: 100, importoUnitario: 2.70 },
    { categoriaEuro: 'Euro 3', sogliaMin: 100, sogliaMax: null, importoUnitario: 4.05 },
    // Euro 4-5-6 e successivi
    { categoriaEuro: 'Euro 4-5-6', sogliaMin: 0, sogliaMax: 100, importoUnitario: 2.58 },
    { categoriaEuro: 'Euro 4-5-6', sogliaMin: 100, sogliaMax: null, importoUnitario: 3.87 },
  ];

  for (const t of tariffeAutovetture) {
    await prisma.tariffaBollo.create({
      data: {
        idConfigurazione: config.id,
        tipoVeicolo: 'Autovettura',
        categoriaEuro: t.categoriaEuro,
        unitaMisura: 'KW',
        sogliaMin: t.sogliaMin,
        sogliaMax: t.sogliaMax,
        importoUnitario: t.importoUnitario,
        descrizione: `Autovetture ${t.categoriaEuro} - ${t.sogliaMax ? `fino a ${t.sogliaMax} KW` : `oltre ${t.sogliaMin} KW`}`,
      },
    });
    // Stessa tariffa per Autoveicolo uso promiscuo
    await prisma.tariffaBollo.create({
      data: {
        idConfigurazione: config.id,
        tipoVeicolo: 'Autoveicolo uso promiscuo',
        categoriaEuro: t.categoriaEuro,
        unitaMisura: 'KW',
        sogliaMin: t.sogliaMin,
        sogliaMax: t.sogliaMax,
        importoUnitario: t.importoUnitario,
        descrizione: `Autoveicoli uso promiscuo ${t.categoriaEuro} - ${t.sogliaMax ? `fino a ${t.sogliaMax} KW` : `oltre ${t.sogliaMin} KW`}`,
      },
    });
  }

  // =====================================================
  // AUTOBUS
  // =====================================================
  await prisma.tariffaBollo.create({
    data: {
      idConfigurazione: config.id,
      tipoVeicolo: 'Autobus',
      unitaMisura: 'KW',
      sogliaMin: 0,
      sogliaMax: null,
      importoUnitario: 2.94,
      descrizione: 'Autobus - tariffa per KW',
    },
  });

  // =====================================================
  // AUTOVEICOLI SPECIALI (escluso autocaravan)
  // =====================================================
  await prisma.tariffaBollo.create({
    data: {
      idConfigurazione: config.id,
      tipoVeicolo: 'Autoveicolo speciale',
      unitaMisura: 'KW',
      sogliaMin: 0,
      sogliaMax: null,
      importoUnitario: 0.43,
      descrizione: 'Autoveicoli speciali - tariffa per KW',
    },
  });

  // =====================================================
  // RIMORCHI SPECIALI >= 3.5 ton
  // =====================================================
  await prisma.tariffaBollo.create({
    data: {
      idConfigurazione: config.id,
      tipoVeicolo: 'Rimorchio speciale',
      unitaMisura: 'FISSO',
      sogliaMin: 3500,
      sogliaMax: null,
      importoUnitario: 0,
      importoFisso: 25.00,
      descrizione: 'Rimorchi speciali con massa >= 3.5 ton - tassa fissa',
    },
  });

  // =====================================================
  // AUTOCARAVAN
  // =====================================================
  await prisma.tariffaBollo.create({
    data: {
      idConfigurazione: config.id,
      tipoVeicolo: 'Autocaravan',
      unitaMisura: 'KW',
      sogliaMin: 0,
      sogliaMax: null,
      importoUnitario: 1.00,
      descrizione: 'Autocaravan - tariffa per KW',
    },
  });

  // =====================================================
  // MOTOCICLI oltre 50cc
  // =====================================================
  const tariffeMotocicli = [
    // Euro 0
    { categoriaEuro: 'Euro 0', sogliaMin: 0, sogliaMax: 11, importoUnitario: 26.00, fisso: true },
    { categoriaEuro: 'Euro 0', sogliaMin: 11, sogliaMax: null, importoUnitario: 1.70 },
    // Euro 1
    { categoriaEuro: 'Euro 1', sogliaMin: 0, sogliaMax: 11, importoUnitario: 23.00, fisso: true },
    { categoriaEuro: 'Euro 1', sogliaMin: 11, sogliaMax: null, importoUnitario: 1.30 },
    // Euro 2
    { categoriaEuro: 'Euro 2', sogliaMin: 0, sogliaMax: 11, importoUnitario: 21.00, fisso: true },
    { categoriaEuro: 'Euro 2', sogliaMin: 11, sogliaMax: null, importoUnitario: 1.00 },
    // Euro 3 e successivi
    { categoriaEuro: 'Euro 3 e successivi', sogliaMin: 0, sogliaMax: 11, importoUnitario: 20.00, fisso: true },
    { categoriaEuro: 'Euro 3 e successivi', sogliaMin: 11, sogliaMax: null, importoUnitario: 0.88 },
  ];

  for (const t of tariffeMotocicli) {
    await prisma.tariffaBollo.create({
      data: {
        idConfigurazione: config.id,
        tipoVeicolo: 'Motociclo',
        categoriaEuro: t.categoriaEuro,
        unitaMisura: 'KW',
        sogliaMin: t.sogliaMin,
        sogliaMax: t.sogliaMax,
        importoUnitario: t.fisso ? 0 : t.importoUnitario,
        importoFisso: t.fisso ? t.importoUnitario : null,
        descrizione: `Motocicli ${t.categoriaEuro} - ${t.sogliaMax ? `fino a ${t.sogliaMax} KW` : `oltre ${t.sogliaMin} KW`}`,
      },
    });
  }

  // =====================================================
  // RIMORCHI < 3.5 ton
  // =====================================================
  await prisma.tariffaBollo.create({
    data: {
      idConfigurazione: config.id,
      tipoVeicolo: 'Rimorchio',
      unitaMisura: 'FISSO',
      sogliaMin: 0,
      sogliaMax: 3500,
      importoUnitario: 0,
      importoFisso: 25.00,
      descrizione: 'Rimorchi con massa < 3.5 ton - tassa fissa',
    },
  });

  // =====================================================
  // VEICOLI ULTRATRENTENNALI (iscritti registri storici)
  // =====================================================
  await prisma.tariffaBollo.create({
    data: {
      idConfigurazione: config.id,
      tipoVeicolo: 'Autovettura ultratrentennale',
      unitaMisura: 'FISSO',
      sogliaMin: 0,
      sogliaMax: null,
      importoUnitario: 0,
      importoFisso: 30.00,
      descrizione: 'Autovetture ultratrentennali iscritte in registri storici',
    },
  });

  await prisma.tariffaBollo.create({
    data: {
      idConfigurazione: config.id,
      tipoVeicolo: 'Motociclo ultratrentennale',
      unitaMisura: 'FISSO',
      sogliaMin: 0,
      sogliaMax: null,
      importoUnitario: 0,
      importoFisso: 20.00,
      descrizione: 'Motocicli ultratrentennali iscritti in registri storici',
    },
  });

  // =====================================================
  // AUTOCARRI < 12 tonnellate (per portata)
  // =====================================================
  const tariffeAutocarriLeggeri = [
    { sogliaMin: 0, sogliaMax: 400, importoFisso: 22.82 },
    { sogliaMin: 400, sogliaMax: 800, importoFisso: 31.95 },
    { sogliaMin: 800, sogliaMax: 1000, importoFisso: 41.07 },
    { sogliaMin: 1000, sogliaMax: 1500, importoFisso: 54.77 },
    { sogliaMin: 1500, sogliaMax: 2000, importoFisso: 77.58 },
    { sogliaMin: 2000, sogliaMax: 2500, importoFisso: 100.40 },
    { sogliaMin: 2500, sogliaMax: 3000, importoFisso: 123.22 },
    { sogliaMin: 3000, sogliaMax: 3500, importoFisso: 146.04 },
    { sogliaMin: 3500, sogliaMax: 4000, importoFisso: 168.86 },
    { sogliaMin: 4000, sogliaMax: 4500, importoFisso: 191.68 },
    { sogliaMin: 4500, sogliaMax: 5000, importoFisso: 214.50 },
    { sogliaMin: 5000, sogliaMax: 6000, importoFisso: 237.32 },
    { sogliaMin: 6000, sogliaMax: 7000, importoFisso: 264.70 },
    { sogliaMin: 7000, sogliaMax: 8000, importoFisso: 292.08 },
  ];

  for (const t of tariffeAutocarriLeggeri) {
    await prisma.tariffaBollo.create({
      data: {
        idConfigurazione: config.id,
        tipoVeicolo: 'Autocarro',
        unitaMisura: 'KG_PORTATA',
        sogliaMin: t.sogliaMin,
        sogliaMax: t.sogliaMax,
        importoUnitario: 0,
        importoFisso: t.importoFisso,
        descrizione: `Autocarri < 12 ton - portata ${t.sogliaMin}-${t.sogliaMax} kg`,
        ordine: 10, // Priorità più bassa per autocarri leggeri
      },
    });
  }

  // =====================================================
  // AUTOCARRI >= 12 tonnellate (per assi e sospensioni)
  // Periodicità ANNUALE
  // =====================================================
  const tariffeAutocarriPesantiAnnuali = [
    // 2 assi
    { assi: 2, sospensione: 'Pneumatiche', importoFisso: 299.55 },
    { assi: 2, sospensione: 'Non pneumatiche', importoFisso: 333.63 },
    // 3 assi
    { assi: 3, sospensione: 'Pneumatiche', importoFisso: 414.20 },
    { assi: 3, sospensione: 'Non pneumatiche', importoFisso: 368.23 },
    // 4 o più assi
    { assi: 4, sospensione: 'Pneumatiche', importoFisso: 471.53 },
    { assi: 4, sospensione: 'Non pneumatiche', importoFisso: 528.65 },
  ];

  for (const t of tariffeAutocarriPesantiAnnuali) {
    await prisma.tariffaBollo.create({
      data: {
        idConfigurazione: config.id,
        tipoVeicolo: 'Autocarro',
        unitaMisura: 'ASSI',
        sogliaMin: t.assi,
        sogliaMax: t.assi === 4 ? null : t.assi,
        importoUnitario: 0,
        importoFisso: t.importoFisso,
        tipoSospensione: t.sospensione,
        periodicita: 'ANNUALE',
        descrizione: `Autocarri >= 12 ton - ${t.assi}${t.assi === 4 ? '+' : ''} assi, sospensioni ${t.sospensione.toLowerCase()}`,
        ordine: 20, // Priorità più alta per autocarri pesanti
      },
    });
  }

  // Periodicità QUADRIMESTRALE
  const tariffeAutocarriPesantiQuadrimestrali = [
    // 2 assi
    { assi: 2, sospensione: 'Pneumatiche', importoFisso: 99.85 },
    { assi: 2, sospensione: 'Non pneumatiche', importoFisso: 111.21 },
    // 3 assi
    { assi: 3, sospensione: 'Pneumatiche', importoFisso: 122.74 },
    { assi: 3, sospensione: 'Non pneumatiche', importoFisso: 138.07 },
    // 4 o più assi
    { assi: 4, sospensione: 'Pneumatiche', importoFisso: 157.18 },
    { assi: 4, sospensione: 'Non pneumatiche', importoFisso: 176.28 },
  ];

  for (const t of tariffeAutocarriPesantiQuadrimestrali) {
    await prisma.tariffaBollo.create({
      data: {
        idConfigurazione: config.id,
        tipoVeicolo: 'Autocarro',
        unitaMisura: 'ASSI',
        sogliaMin: t.assi,
        sogliaMax: t.assi === 4 ? null : t.assi,
        importoUnitario: 0,
        importoFisso: t.importoFisso,
        tipoSospensione: t.sospensione,
        periodicita: 'QUADRIMESTRALE',
        descrizione: `Autocarri >= 12 ton - ${t.assi}${t.assi === 4 ? '+' : ''} assi, sospensioni ${t.sospensione.toLowerCase()} (quadrimestrale)`,
        ordine: 20,
      },
    });
  }

  // =====================================================
  // RIMORCHI TRASPORTO PERSONE
  // =====================================================
  const tariffeRimorchiPersone = [
    { sogliaMin: 1, sogliaMax: 15, importoFisso: 114.10 },
    { sogliaMin: 16, sogliaMax: 25, importoFisso: 171.14 },
    { sogliaMin: 26, sogliaMax: 40, importoFisso: 355.87 },
    { sogliaMin: 41, sogliaMax: null, importoFisso: 427.17 },
  ];

  for (const t of tariffeRimorchiPersone) {
    await prisma.tariffaBollo.create({
      data: {
        idConfigurazione: config.id,
        tipoVeicolo: 'Rimorchio trasporto persone',
        unitaMisura: 'POSTI',
        sogliaMin: t.sogliaMin,
        sogliaMax: t.sogliaMax,
        importoUnitario: 0,
        importoFisso: t.importoFisso,
        descrizione: `Rimorchi trasporto persone - ${t.sogliaMax ? `${t.sogliaMin}-${t.sogliaMax}` : `oltre ${t.sogliaMin - 1}`} posti`,
      },
    });
  }

  // =====================================================
  // MOTOCARRI E MOTOFURGONI
  // =====================================================
  const tariffeMotocarri = [
    { sogliaMin: 0, sogliaMax: 125, importoFisso: 20.00 },
    { sogliaMin: 125, sogliaMax: 500, importoFisso: 20.00 },
  ];

  for (const t of tariffeMotocarri) {
    for (const tipo of ['Motocarro', 'Motofurgone']) {
      await prisma.tariffaBollo.create({
        data: {
          idConfigurazione: config.id,
          tipoVeicolo: tipo,
          unitaMisura: 'CC',
          sogliaMin: t.sogliaMin,
          sogliaMax: t.sogliaMax,
          importoUnitario: 0,
          importoFisso: t.importoFisso,
          descrizione: `${tipo} - cilindrata ${t.sogliaMax ? `fino a ${t.sogliaMax}` : `oltre ${t.sogliaMin}`} cc`,
        },
      });
    }
  }

  // =====================================================
  // TASSA AGGIUNTIVA MASSA RIMORCHIABILE (Trattori stradali)
  // =====================================================
  const tariffeMassaRimorchiabile = [
    { tariffa: 1, descrizioneRange: 'massa complessiva inferiore a 18 ton', annuale: 267.00 },
    { tariffa: 2, descrizioneRange: 'massa complessiva da 18 ton in su', annuale: 585.00 },
    { tariffa: 3, descrizioneRange: '2 assi', annuale: 585.00 },
    { tariffa: 4, descrizioneRange: '3 assi', annuale: 825.00 },
  ];

  for (const t of tariffeMassaRimorchiabile) {
    await prisma.tariffaBollo.create({
      data: {
        idConfigurazione: config.id,
        tipoVeicolo: 'Trattore stradale',
        unitaMisura: 'MASSA_RIMORCHIABILE',
        sogliaMin: 0,
        sogliaMax: null,
        importoUnitario: 0,
        importoFisso: t.annuale,
        periodicita: 'ANNUALE',
        descrizione: `Tassa aggiuntiva trattori stradali - ${t.descrizioneRange}`,
        ordine: t.tariffa,
      },
    });
  }

  console.log('✅ Tariffe Lombardia 2026 inserite con successo!');
}

async function main() {
  console.log('🌱 Inizializzazione del database...');

  // Verifica se esiste già un utente admin
  const existingAdmin = await prisma.utente.findFirst({
    where: { ruolo: Ruolo.ADMIN },
  });

  if (!existingAdmin) {
    // Crea utente admin di default
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await prisma.utente.create({
      data: {
        email: 'admin@sissibol.it',
        password: hashedPassword,
        ruolo: Ruolo.ADMIN,
      },
    });

    console.log('✅ Utente admin creato con successo!');
    console.log('📧 Email: admin@sissibol.it');
    console.log('🔑 Password: admin123');
    console.log('⚠️  IMPORTANTE: Cambiare la password al primo accesso!');
  } else {
    console.log('✅ Utente admin già esistente');
  }

  // Seed delle tariffe Lombardia 2026
  await seedTariffeLombardia2026();

  console.log('🎉 Seed completato!');
}

main()
  .catch((e) => {
    console.error('❌ Errore durante il seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
