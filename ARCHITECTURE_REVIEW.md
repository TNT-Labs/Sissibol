# Revisione Architetturale - Sissibol
## Analisi Completa del Progetto

**Data**: 26 Gennaio 2026
**Revisore**: Senior Full Stack Developer / QA Engineer
**Stack**: React 19 / Vite 7 (Frontend) + NestJS 10 / Prisma / PostgreSQL (Backend)

---

## TABELLA CRITICITA'

| # | Area | Criticità | Severità | Descrizione | Impatto |
|---|------|-----------|----------|-------------|---------|
| 1 | Database | Versionamento Tariffario Mancante | **ALTA** | Le tariffe modificate alterano i calcoli storici dei pagamenti già effettuati | Integrità dati, conformità fiscale |
| 2 | Sicurezza | File Upload Non Validato | **ALTA** | Multer accetta qualsiasi tipo di file senza validazione MIME type | Remote Code Execution potenziale |
| 3 | Concorrenza | Race Condition Pagamenti | **ALTA** | Nessun locking ottimistico per modifiche simultanee | Dati inconsistenti, double payment |
| 4 | Core Logic | Conflitto Esenzioni Multiple | **ALTA** | Esenzioni con logica OR possono sovrapporsi (elettrico + ultratrentennale) | Calcoli errati, perdita economica |
| 5 | Sicurezza | JWT Senza Refresh Token | **ALTA** | Nessun meccanismo di rotazione o invalidazione token | Sessioni compromesse non revocabili |
| 6 | PWA | Caching Pattern Errato | **MEDIA** | Pattern `/^https:\/\/api\..*/i` non matcha API su localhost/domini custom | Offline non funzionante |
| 7 | Performance | Memory Leak nei Report | **MEDIA** | Tutti i dati caricati in memoria prima di generare PDF/Excel | Crash browser con molti record |
| 8 | Data Model | Storico Targa Non Gestito | **MEDIA** | Cambio targa sovrascrive valore senza mantenere storico | Perdita tracciabilità |
| 9 | Core Logic | Periodicità Quadrimestrale Incompleta | **MEDIA** | Date scadenza calcolate solo per mese, non giorno specifico | Notifiche imprecise |
| 10 | Sicurezza | Registrazione Pubblica | **MEDIA** | Endpoint `/auth/register` accessibile senza autenticazione | Account non autorizzati |
| 11 | Sicurezza | IDOR - ID Sequenziali | **MEDIA** | ID auto-incrementali prevedibili nelle API | Enumerazione risorse |
| 12 | PWA | Background Sync Non Implementato | **MEDIA** | Dati offline non sincronizzati al ritorno della connessione | Perdita dati utente |
| 13 | Core Logic | Anni Bisestili nelle Notifiche | **BASSA** | Calcolo 30 giorni non considera edge case timezone | Notifiche sbagliate a cavallo anno |
| 14 | Sicurezza | Rate Limiting Assente | **BASSA** | Nessuna protezione brute force su login | Account compromissibili |
| 15 | Files | Ricevute Non Scaricabili | **BASSA** | File caricati ma nessun endpoint per download | UX incompleta |
| 16 | Audit | Logging Assente | **BASSA** | Nessun tracciamento modifiche sensibili | Non conformità GDPR/compliance |
| 17 | Frontend | React 19 `use` Hook Non Utilizzato | **BASSA** | Pattern dataloading obsoleto con useEffect | Performance subottimale |

---

## ANALISI DETTAGLIATA

### 1. MOTORE DI CALCOLO (Core Logic)

#### 1.1 Coerenza Parametri Veicolo

**File**: `backend/src/bollo/bollo.service.ts`

**Analisi**: Il motore di calcolo gestisce correttamente i diversi tipi di veicolo, ma presenta alcune lacune:

```
Autovettura      → potenzaKw (OK)
Motociclo        → potenzaKw (OK)
Autocarro <12t   → portataKg (OK)
Autocarro >=12t  → numeroAssi + tipoSospensione (OK)
Trattore         → come Autocarro + massaRimorchiabileKg (OK)
Motocarro        → cilindrata (OK)
Rimorchio        → fisso o numeroPosti (OK)
```

**PROBLEMA TROVATO** (riga 451-453):
```typescript
const pesoComplessivo = veicolo.pesoComplessivoKg || 0;
const portata = veicolo.portataKg || 0;
// Se entrambi sono 0, il calcolo fallisce silenziosamente
```

#### 1.2 Logica Esenzioni - CONFLITTO CRITICO

**File**: `backend/src/bollo/bollo.service.ts:170-213`

**PROBLEMA**: La logica di verifica esenzioni usa condizioni OR indipendenti:

```typescript
// Linea 185-200 - Logica attuale con BUG
if (esenzione.alimentazione && veicolo.alimentazione === esenzione.alimentazione) {
  applicabile = true;  // ← Se elettrico
}
if (esenzione.anni_da_immatricolazione && veicolo.dataImmatricolazione) {
  if (anniVeicolo >= esenzione.anni_da_immatricolazione) {
    applicabile = true;  // ← Se ultratrentennale
  }
}
// CONFLITTO: Un veicolo elettrico ultratrentennale applica ENTRAMBE le esenzioni!
```

**Scenario Problematico**:
- Veicolo elettrico immatricolato nel 1995 (31 anni)
- Esenzione 1: Elettrico → TOTALE (5 anni)
- Esenzione 2: Ultratrentennale → TOTALE
- **Risultato**: Due esenzioni totali applicate (potenziale conflitto logico)

#### 1.3 Periodicità - Date Scadenza Imprecise

**File**: `backend/src/scadenze/scadenze.service.ts:16-25`

Il sistema calcola solo l'ultimo giorno del mese, ma per la periodicità quadrimestrale la normativa richiede date specifiche:

```typescript
// Attuale: solo ultimo giorno mese
private getUltimoGiornoMese(anno: number, mese: number): Date {
  return new Date(anno, mese, 0);
}

// MANCANTE: Gestione periodicità quadrimestrale con date specifiche:
// - Gennaio: scadenza ultimo giorno mese
// - Maggio: scadenza 31 maggio
// - Settembre: scadenza 30 settembre
```

---

### 2. REVISIONE ARCHITETTURALE & BACKEND

#### 2.1 Schema Prisma - Versionamento Tariffario MANCANTE

**File**: `backend/prisma/schema.prisma`

**PROBLEMA CRITICO**: Lo schema attuale non preserva lo snapshot delle tariffe applicate ai pagamenti storici.

**Schema Attuale**:
```prisma
model Pagamento {
  id                Int       @id @default(autoincrement())
  idScadenza        Int       @map("id_scadenza")
  dataPagamento     DateTime  @map("data_pagamento")
  importoPagato     Decimal   @map("importo_pagato")
  metodoPagamento   String?
  ricevutaFile      String?
  // MANCANTE: snapshot tariffe applicate!
}
```

**Conseguenza**: Se le tariffe 2026 vengono modificate, tutti i calcoli storici risulteranno alterati quando si rigenerano report.

#### 2.2 JWT e Sicurezza Route

**File**: `backend/src/auth/auth.service.ts` e `jwt.strategy.ts`

**Problemi Identificati**:

1. **Nessun Refresh Token**: Il JWT scade ma non c'è meccanismo di rinnovo
2. **Nessuna Blacklist**: Token compromessi non possono essere invalidati
3. **Registrazione Pubblica**: `/auth/register` accessibile a tutti

```typescript
// Attuale - Nessuna protezione
@Post('register')
async register(@Body() registerDto: RegisterDto) {
  return this.authService.register(registerDto);
}
```

#### 2.3 File Upload Multer - VULNERABILITA' CRITICA

**File**: `backend/src/pagamenti/pagamenti.controller.ts:41-56`

```typescript
@UseInterceptors(
  FileInterceptor('ricevuta', {
    storage: diskStorage({
      destination: './uploads/ricevute',
      filename: (req, file, callback) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);  // ← PERICOLO: estensione non validata
        callback(null, `ricevuta-${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    // MANCANTE: fileFilter per validare MIME type!
  }),
)
```

**Rischio**: Upload di file `.exe`, `.php`, `.sh` mascherati.

---

### 3. OTTIMIZZAZIONE PWA & FRONTEND

#### 3.1 Strategia Caching - Pattern Errato

**File**: `frontend/vite.config.ts:44-55`

```typescript
runtimeCaching: [
  {
    urlPattern: /^https:\/\/api\..*/i,  // ← Pattern SBAGLIATO
    handler: 'NetworkFirst',
    // ...
  },
],
```

**PROBLEMA**: Il pattern matcha solo URL che iniziano con `https://api.` ma:
- In sviluppo l'API è su `http://localhost:3000`
- In produzione potrebbe essere `https://sissibol-api.example.com`

#### 3.2 NetworkFirst - Analisi Strategia

Per uno scadenziario, **NetworkFirst è la scelta corretta** perché:
- I dati devono essere sempre aggiornati quando online
- L'offline deve mostrare l'ultimo stato noto
- Le scadenze non possono essere outdated

**TUTTAVIA**, manca completamente:
- Background Sync per dati inseriti offline
- IndexedDB per persistenza locale
- Conflict resolution

#### 3.3 React 19 - Hook `use` Non Utilizzato

**File**: `frontend/src/context/AuthContext.tsx:19-35`

Pattern attuale con `useEffect`:
```typescript
useEffect(() => {
  const initAuth = async () => {
    const currentUser = authService.getCurrentUser();
    if (currentUser && authService.isAuthenticated()) {
      try {
        const profile = await authService.getProfile();
        setUser(profile);
      } catch (error) { /* ... */ }
    }
    setLoading(false);
  };
  initAuth();
}, []);
```

---

### 4. BUG HUNTING - EDGE CASES

#### 4.1 Cambio Targa/Proprietario

**File**: `backend/src/veicoli/veicoli.service.ts:63-72`

```typescript
async update(id: number, updateVeicoloDto: UpdateVeicoloDto) {
  await this.findOne(id);
  return this.prisma.veicolo.update({
    where: { id },
    data: updateVeicoloDto,  // ← Sovrascrive targa senza storico
    // ...
  });
}
```

**Conseguenze**:
- Report storici mostrano la nuova targa
- Impossibile tracciare passaggi di proprietà
- Scadenze storiche riferiscono a targa sbagliata

#### 4.2 Anni Bisestili e Calcolo 30 Giorni

**File**: `backend/src/scadenze/scadenze.service.ts:204-213`

```typescript
async getScadenzeInScadenza(giorniAnticipo: number = 30) {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);  // ← Non considera timezone

  const dataLimite = new Date(oggi);
  dataLimite.setDate(dataLimite.getDate() + giorniAnticipo);
  // Problema: 30 giorni dal 31 dicembre 2024 → 30 gennaio 2025
  // Ma febbraio 2024 ha 29 giorni (bisestile) vs 28 nel 2025
}
```

#### 4.3 Concorrenza - Race Condition

**Scenario**:
1. Operatore A apre pagamento ID 123 (importo: €500)
2. Operatore B apre pagamento ID 123 (importo: €500)
3. Operatore A modifica a €550, salva
4. Operatore B modifica a €480, salva → **Sovrascrive A senza avviso!**

**Mancante**: Optimistic locking con version field.

---

### 5. REPORTING & EXPORT

#### 5.1 Memory Leak con Dataset Grandi

**File**: `frontend/src/pages/report/ReportPage.tsx:41-105`

```typescript
const generateScadenzePDF = async () => {
  const scadenze = await scadenzeService.getAll(/*...*/);  // ← Carica TUTTO in memoria

  const tableData = scadenze.map((s) => [/*...*/]);  // ← Altro array in memoria

  autoTable(doc, {
    body: tableData,  // ← Terza copia dei dati
    // ...
  });
};
```

**Con 10.000 scadenze**: ~3 copie × 10KB/record = ~300MB RAM

---

## SNIPPET DI CODICE RISOLUTIVI

### SOLUZIONE 1: Versionamento Tariffario (ALTA)

```prisma
// backend/prisma/schema.prisma - AGGIUNGERE

model SnapshotCalcoloBollo {
  id                    Int       @id @default(autoincrement())
  idPagamento           Int       @unique @map("id_pagamento")

  // Snapshot dati veicolo al momento del calcolo
  veicoloSnapshot       Json      @map("veicolo_snapshot")

  // Snapshot tariffe applicate
  tariffeApplicate      Json      @map("tariffe_applicate")
  esenzioniApplicate    Json      @map("esenzioni_applicate")

  // Dettaglio calcolo
  importoBase           Decimal   @map("importo_base") @db.Decimal(10, 2)
  importoRidotto        Decimal?  @map("importo_ridotto") @db.Decimal(10, 2)
  scontoRidApplicato    Decimal   @map("sconto_rid_applicato") @db.Decimal(5, 2)
  dettaglioCalcolo      String    @map("dettaglio_calcolo")

  // Riferimento configurazione (per audit)
  idConfigurazione      Int       @map("id_configurazione")
  annoConfigurazione    Int       @map("anno_configurazione")
  regioneConfigurazione String    @map("regione_configurazione")

  createdAt             DateTime  @default(now())

  pagamento             Pagamento @relation(fields: [idPagamento], references: [id])

  @@map("snapshot_calcolo_bollo")
}

// Aggiornare Pagamento
model Pagamento {
  // ... campi esistenti ...
  snapshotCalcolo       SnapshotCalcoloBollo?
}
```

```typescript
// backend/src/pagamenti/pagamenti.service.ts - MODIFICARE

async create(createPagamentoDto: CreatePagamentoDto) {
  const scadenza = await this.prisma.scadenza.findUnique({
    where: { id: createPagamentoDto.idScadenza },
    include: { veicolo: true },
  });

  // Calcola e salva snapshot
  const calcoloBollo = await this.bolloService.calcolaBollo(
    scadenza.idVeicolo,
    scadenza.annoScadenza,
    scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
  );

  return this.prisma.$transaction(async (tx) => {
    const pagamento = await tx.pagamento.create({
      data: {
        idScadenza: createPagamentoDto.idScadenza,
        dataPagamento: new Date(createPagamentoDto.dataPagamento),
        importoPagato: createPagamentoDto.importoPagato,
        metodoPagamento: createPagamentoDto.metodoPagamento,
        ricevutaFile: createPagamentoDto.ricevutaFile,
      },
    });

    // Salva snapshot immutabile
    await tx.snapshotCalcoloBollo.create({
      data: {
        idPagamento: pagamento.id,
        veicoloSnapshot: scadenza.veicolo,
        tariffeApplicate: calcoloBollo.tariffeApplicate,
        esenzioniApplicate: calcoloBollo.esenzioni,
        importoBase: calcoloBollo.importoBase,
        importoRidotto: calcoloBollo.importoRidotto,
        scontoRidApplicato: calcoloBollo.scontoRid,
        dettaglioCalcolo: calcoloBollo.dettaglioCalcolo,
        idConfigurazione: /* ID config usata */,
        annoConfigurazione: scadenza.annoScadenza,
        regioneConfigurazione: scadenza.veicolo.regione || 'DEFAULT',
      },
    });

    // Aggiorna stato scadenza
    await tx.scadenza.update({
      where: { id: createPagamentoDto.idScadenza },
      data: { stato: 'PAGATO' },
    });

    return pagamento;
  });
}
```

---

### SOLUZIONE 2: Validazione File Upload (ALTA)

```typescript
// backend/src/pagamenti/pagamenti.controller.ts - SOSTITUIRE

import { BadRequestException } from '@nestjs/common';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'];

@Post()
@UseInterceptors(
  FileInterceptor('ricevuta', {
    storage: diskStorage({
      destination: './uploads/ricevute',
      filename: (req, file, callback) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname).toLowerCase();

        // Validazione estensione
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return callback(
            new BadRequestException(
              `Estensione file non consentita. Ammesse: ${ALLOWED_EXTENSIONS.join(', ')}`
            ),
            null,
          );
        }

        callback(null, `ricevuta-${uniqueSuffix}${ext}`);
      },
    }),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, callback) => {
      // Validazione MIME type
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return callback(
          new BadRequestException(
            `Tipo file non consentito. Ammessi: PDF, JPEG, PNG, GIF, WebP`
          ),
          false,
        );
      }
      callback(null, true);
    },
  }),
)
create(
  @Body() createPagamentoDto: CreatePagamentoDto,
  @UploadedFile() file?: MulterFile,
) {
  if (file) {
    // Sanitizza il path per evitare path traversal
    createPagamentoDto.ricevutaFile = file.filename; // Solo filename, non path completo
  }
  return this.pagamentiService.create(createPagamentoDto);
}
```

---

### SOLUZIONE 3: Optimistic Locking (ALTA)

```prisma
// backend/prisma/schema.prisma - AGGIUNGERE version field

model Pagamento {
  id                Int       @id @default(autoincrement())
  // ... altri campi ...
  version           Int       @default(0) // Optimistic lock version
  updatedAt         DateTime  @updatedAt
}

model Scadenza {
  // ... altri campi ...
  version           Int       @default(0)
}
```

```typescript
// backend/src/pagamenti/pagamenti.service.ts

import { ConflictException } from '@nestjs/common';

async update(id: number, updatePagamentoDto: UpdatePagamentoDto & { version: number }) {
  const { version, ...data } = updatePagamentoDto;

  try {
    return await this.prisma.pagamento.update({
      where: {
        id,
        version, // Verifica che la versione sia quella attesa
      },
      data: {
        ...data,
        version: { increment: 1 }, // Incrementa versione
      },
    });
  } catch (error) {
    if (error.code === 'P2025') { // Record not found (version mismatch)
      throw new ConflictException(
        'Il record è stato modificato da un altro utente. Ricarica i dati e riprova.'
      );
    }
    throw error;
  }
}
```

```typescript
// frontend/src/services/pagamenti.service.ts - AGGIUNGERE retry logic

export const pagamentiService = {
  async update(id: number, data: UpdatePagamentoDto): Promise<Pagamento> {
    try {
      const response = await api.patch(`/pagamenti/${id}`, data);
      return response.data;
    } catch (error) {
      if (error.response?.status === 409) {
        // Conflict - mostra dialog per ricaricare
        const reload = window.confirm(
          'Questo pagamento è stato modificato da un altro utente. ' +
          'Vuoi ricaricare i dati aggiornati?'
        );
        if (reload) {
          window.location.reload();
        }
        throw new Error('Conflitto di modifica');
      }
      throw error;
    }
  },
};
```

---

### SOLUZIONE 4: Gestione Conflitti Esenzioni (ALTA)

```typescript
// backend/src/bollo/bollo.service.ts - SOSTITUIRE verificaEsenzioni

private async verificaEsenzioni(
  veicolo: any,
  idConfigurazione: number,
): Promise<EsenzioneApplicata[]> {
  const esenzioniApplicate: EsenzioneApplicata[] = [];

  const esenzioni = await this.prisma.$queryRaw<any[]>`
    SELECT * FROM "esenzioni_bollo"
    WHERE "id_configurazione" = ${idConfigurazione}
    ORDER BY
      CASE WHEN tipo_esenzione = 'TOTALE' THEN 0 ELSE 1 END,
      COALESCE(percentuale_riduzione, 100) DESC
  `;

  let esenzioneTotaleApplicata = false;
  let percentualeRiduzioneCumulativa = 0;

  for (const esenzione of esenzioni) {
    let applicabile = false;
    let motivoApplicazione = '';

    // Verifica criteri con priorità
    // 1. Alimentazione (priorità alta per elettrici)
    if (esenzione.alimentazione && veicolo.alimentazione === esenzione.alimentazione) {
      applicabile = true;
      motivoApplicazione = `Alimentazione: ${veicolo.alimentazione}`;
    }

    // 2. Anzianità veicolo (solo se non già esente per altro motivo totale)
    if (!applicabile && esenzione.anni_da_immatricolazione && veicolo.dataImmatricolazione) {
      const anniVeicolo = this.calcolaAnniVeicolo(veicolo.dataImmatricolazione);
      if (anniVeicolo >= esenzione.anni_da_immatricolazione) {
        // Verifica che non sia già coperto da esenzione elettrico (primi 5 anni)
        if (veicolo.alimentazione === 'Elettrico' && anniVeicolo <= 5) {
          continue; // Già coperto da esenzione elettrico
        }
        applicabile = true;
        motivoApplicazione = `Anzianità: ${anniVeicolo} anni`;
      }
    }

    // 3. Tipo veicolo
    if (!applicabile && esenzione.tipo_veicolo && veicolo.tipoVeicolo === esenzione.tipo_veicolo) {
      applicabile = true;
      motivoApplicazione = `Tipo veicolo: ${veicolo.tipoVeicolo}`;
    }

    if (applicabile) {
      // Gestione conflitti: solo una esenzione TOTALE, riduzioni cumulative fino al 100%
      if (esenzione.tipo_esenzione === 'TOTALE') {
        if (esenzioneTotaleApplicata) {
          // Ignora esenzioni totali duplicate
          continue;
        }
        esenzioneTotaleApplicata = true;
      } else if (esenzione.tipo_esenzione === 'PARZIALE') {
        if (esenzioneTotaleApplicata) {
          // Se c'è già esenzione totale, ignora le parziali
          continue;
        }
        const percentuale = parseFloat(esenzione.percentuale_riduzione) || 0;
        if (percentualeRiduzioneCumulativa + percentuale > 100) {
          // Non superare il 100%
          continue;
        }
        percentualeRiduzioneCumulativa += percentuale;
      }

      esenzioniApplicate.push({
        tipo: esenzione.tipo_esenzione,
        descrizione: `${esenzione.descrizione} (${motivoApplicazione})`,
        percentualeRiduzione: esenzione.percentuale_riduzione
          ? parseFloat(esenzione.percentuale_riduzione)
          : null,
      });
    }
  }

  return esenzioniApplicate;
}
```

---

### SOLUZIONE 5: JWT Refresh Token (ALTA)

```typescript
// backend/src/auth/auth.service.ts - AGGIUNGERE

import { v4 as uuidv4 } from 'uuid';

interface TokenPayload {
  email: string;
  sub: number;
  ruolo: string;
  jti?: string; // JWT ID for revocation
}

@Injectable()
export class AuthService {
  // ... costruttore esistente ...

  async login(user: any) {
    const jti = uuidv4();
    const payload: TokenPayload = {
      email: user.email,
      sub: user.id,
      ruolo: user.ruolo,
      jti,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti },
      { expiresIn: '7d' }
    );

    // Salva refresh token hash in DB
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        jti,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900, // 15 minuti
      user: {
        id: user.id,
        email: user.email,
        ruolo: user.ruolo,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);

      // Verifica che il refresh token esista e non sia revocato
      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          userId: payload.sub,
          jti: payload.jti,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Refresh token non valido o revocato');
      }

      // Ottieni utente
      const user = await this.prisma.utente.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('Utente non trovato');
      }

      // Revoca vecchio token e genera nuovo
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      return this.login(user);
    } catch (error) {
      throw new UnauthorizedException('Refresh token non valido');
    }
  }

  async logout(userId: number, jti?: string) {
    // Revoca tutti i token dell'utente o solo quello specifico
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        ...(jti ? { jti } : {}),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }
}
```

```prisma
// backend/prisma/schema.prisma - AGGIUNGERE

model RefreshToken {
  id          Int       @id @default(autoincrement())
  userId      Int       @map("user_id")
  tokenHash   String    @map("token_hash")
  jti         String    @unique // JWT ID
  expiresAt   DateTime  @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now())

  user        Utente    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}
```

---

### SOLUZIONE 6: PWA Caching Corretto (MEDIA)

```typescript
// frontend/vite.config.ts - SOSTITUIRE

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const buildTime = new Date().toISOString()

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Sissibol - Gestione Scadenziario Bolli',
        short_name: 'Sissibol',
        description: 'PWA per la gestione dello scadenziario bolli per autotrasporto',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        additionalManifestEntries: [
          { url: '/version.json', revision: buildTime }
        ],
        runtimeCaching: [
          {
            // Cache API calls - pattern corretto per qualsiasi origine
            urlPattern: ({ url, request }) => {
              // Match API calls basato su path, non hostname
              return url.pathname.startsWith('/api') ||
                     url.pathname.startsWith('/auth') ||
                     url.pathname.startsWith('/clienti') ||
                     url.pathname.startsWith('/veicoli') ||
                     url.pathname.startsWith('/scadenze') ||
                     url.pathname.startsWith('/pagamenti') ||
                     url.pathname.startsWith('/bollo') ||
                     url.pathname.startsWith('/utenti');
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 86400, // 1 giorno
              },
              networkTimeoutSeconds: 10, // Fallback a cache dopo 10s
              cacheableResponse: {
                statuses: [0, 200], // Cache anche opaque responses
              },
            },
          },
          {
            // Cache immagini statiche
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 giorni
              },
            },
          },
        ],
      },
    }),
  ],
})
```

---

### SOLUZIONE 7: Report con Streaming/Paginazione (MEDIA)

```typescript
// frontend/src/pages/report/ReportPage.tsx - SOSTITUIRE generateScadenzePDF

const generateScadenzePDF = async () => {
  setLoading(true);
  try {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text('Report Scadenze Bolli', 14, 20);
    doc.setFontSize(10);
    doc.text(`Data generazione: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it })}`, 14, 30);

    let yPos = 40;
    let pageNumber = 1;
    let totalRecords = 0;
    let totalImporto = 0;

    const PAGE_SIZE = 100; // Elabora 100 record alla volta
    let offset = 0;
    let hasMore = true;

    // Header tabella iniziale
    const headers = [['Scadenza', 'Cliente', 'Veicolo', 'Importo', 'Stato']];

    while (hasMore) {
      // Fetch paginato dal backend
      const response = await scadenzeService.getPaginated({
        stato: filterStato || undefined,
        idCliente: filterCliente,
        limit: PAGE_SIZE,
        offset,
      });

      const scadenze = response.data;
      hasMore = response.hasMore;
      offset += PAGE_SIZE;

      if (scadenze.length === 0) break;

      // Processa batch
      const tableData = scadenze.map((s) => {
        totalRecords++;
        totalImporto += s.importoPrevisto ? Number(s.importoPrevisto) : 0;

        return [
          `${getMeseLabel(s.meseScadenza)} ${s.annoScadenza}`,
          s.veicolo?.cliente ? getClienteDisplayName(s.veicolo.cliente) : '-',
          s.veicolo?.targa || '-',
          s.importoPrevisto ? `€ ${Number(s.importoPrevisto).toFixed(2)}` : '-',
          s.stato.replace('_', ' '),
        ];
      });

      autoTable(doc, {
        head: totalRecords <= PAGE_SIZE ? headers : undefined, // Header solo prima pagina
        body: tableData,
        startY: yPos,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
        didDrawPage: (data) => {
          // Footer con numero pagina
          doc.setFontSize(8);
          doc.text(
            `Pagina ${doc.getNumberOfPages()}`,
            doc.internal.pageSize.width / 2,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
          );
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 5;

      // Nuova pagina se necessario
      if (yPos > 270 && hasMore) {
        doc.addPage();
        yPos = 20;
      }

      // Libera memoria
      scadenze.length = 0;
    }

    // Totali finali
    doc.setFontSize(10);
    doc.text(`Totale scadenze: ${totalRecords}`, 14, yPos + 10);
    doc.text(`Importo totale: € ${totalImporto.toFixed(2)}`, 14, yPos + 16);

    doc.save(`report-scadenze-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  } catch (error) {
    console.error('Errore nella generazione del PDF:', error);
    alert('Errore nella generazione del report PDF');
  } finally {
    setLoading(false);
  }
};
```

```typescript
// backend/src/scadenze/scadenze.service.ts - AGGIUNGERE endpoint paginato

async findAllPaginated(
  stato?: StatoScadenza,
  idCliente?: number,
  limit: number = 100,
  offset: number = 0,
) {
  await this.updateScaduteAutomaticamente();

  const where: any = {};
  if (stato) where.stato = stato;
  if (idCliente) where.veicolo = { idCliente };

  const [data, total] = await Promise.all([
    this.prisma.scadenza.findMany({
      where,
      include: {
        veicolo: { include: { cliente: true } },
        pagamenti: true,
      },
      orderBy: [{ annoScadenza: 'desc' }, { meseScadenza: 'desc' }],
      take: limit,
      skip: offset,
    }),
    this.prisma.scadenza.count({ where }),
  ]);

  return {
    data,
    total,
    hasMore: offset + limit < total,
  };
}
```

---

### SOLUZIONE 8: Storico Targa (MEDIA)

```prisma
// backend/prisma/schema.prisma - AGGIUNGERE

model StoricoVeicolo {
  id              Int       @id @default(autoincrement())
  idVeicolo       Int       @map("id_veicolo")

  // Snapshot campi modificabili
  targa           String
  idCliente       Int       @map("id_cliente")

  // Metadati cambio
  tipoCambio      String    @map("tipo_cambio") // CAMBIO_TARGA, PASSAGGIO_PROPRIETA
  dataEvento      DateTime  @map("data_evento") @db.Date
  note            String?

  createdAt       DateTime  @default(now())
  createdBy       Int?      @map("created_by")

  veicolo         Veicolo   @relation(fields: [idVeicolo], references: [id])

  @@map("storico_veicoli")
}
```

```typescript
// backend/src/veicoli/veicoli.service.ts - MODIFICARE update

async update(id: number, updateVeicoloDto: UpdateVeicoloDto, userId?: number) {
  const veicoloAttuale = await this.findOne(id);

  // Verifica se ci sono cambi significativi
  const cambiSignificativi: { tipo: string; vecchioValore: any; nuovoValore: any }[] = [];

  if (updateVeicoloDto.targa && updateVeicoloDto.targa !== veicoloAttuale.targa) {
    cambiSignificativi.push({
      tipo: 'CAMBIO_TARGA',
      vecchioValore: veicoloAttuale.targa,
      nuovoValore: updateVeicoloDto.targa,
    });
  }

  if (updateVeicoloDto.idCliente && updateVeicoloDto.idCliente !== veicoloAttuale.idCliente) {
    cambiSignificativi.push({
      tipo: 'PASSAGGIO_PROPRIETA',
      vecchioValore: veicoloAttuale.idCliente,
      nuovoValore: updateVeicoloDto.idCliente,
    });
  }

  return this.prisma.$transaction(async (tx) => {
    // Salva storico per ogni cambio significativo
    for (const cambio of cambiSignificativi) {
      await tx.storicoVeicolo.create({
        data: {
          idVeicolo: id,
          targa: veicoloAttuale.targa,
          idCliente: veicoloAttuale.idCliente,
          tipoCambio: cambio.tipo,
          dataEvento: new Date(),
          note: `${cambio.tipo}: da "${cambio.vecchioValore}" a "${cambio.nuovoValore}"`,
          createdBy: userId,
        },
      });
    }

    // Aggiorna veicolo
    return tx.veicolo.update({
      where: { id },
      data: updateVeicoloDto,
      include: { cliente: true },
    });
  });
}
```

---

### SOLUZIONE 9: Protezione Registrazione (MEDIA)

```typescript
// backend/src/auth/auth.controller.ts - MODIFICARE

import { UseGuards, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  // ... altri metodi ...

  // Registrazione protetta - solo ADMIN può creare nuovi utenti
  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // Endpoint per primo setup (solo se non esistono utenti)
  @Post('setup')
  async initialSetup(@Body() registerDto: RegisterDto) {
    const userCount = await this.prisma.utente.count();

    if (userCount > 0) {
      throw new ForbiddenException(
        'Setup iniziale già completato. Contatta un amministratore per creare nuovi account.'
      );
    }

    // Forza ruolo ADMIN per il primo utente
    return this.authService.register({
      ...registerDto,
      ruolo: 'ADMIN',
    });
  }
}
```

---

### SOLUZIONE 10: Background Sync PWA (MEDIA)

```typescript
// frontend/src/services/offline-queue.ts - NUOVO FILE

import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OfflineQueueDB extends DBSchema {
  'pending-requests': {
    key: string;
    value: {
      id: string;
      method: string;
      url: string;
      body?: any;
      timestamp: number;
      retries: number;
    };
  };
}

class OfflineQueueService {
  private db: IDBPDatabase<OfflineQueueDB> | null = null;

  async init() {
    this.db = await openDB<OfflineQueueDB>('sissibol-offline', 1, {
      upgrade(db) {
        db.createObjectStore('pending-requests', { keyPath: 'id' });
      },
    });
  }

  async addToQueue(method: string, url: string, body?: any) {
    if (!this.db) await this.init();

    const request = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      method,
      url,
      body,
      timestamp: Date.now(),
      retries: 0,
    };

    await this.db!.add('pending-requests', request);

    // Registra per Background Sync se disponibile
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register('sync-pending-requests');
    }
  }

  async processPendingRequests() {
    if (!this.db) await this.init();

    const requests = await this.db!.getAll('pending-requests');

    for (const request of requests) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: request.body ? JSON.stringify(request.body) : undefined,
        });

        if (response.ok) {
          // Successo - rimuovi dalla coda
          await this.db!.delete('pending-requests', request.id);
        } else if (response.status >= 500) {
          // Errore server - riprova dopo
          await this.db!.put('pending-requests', {
            ...request,
            retries: request.retries + 1,
          });
        } else {
          // Errore client (4xx) - rimuovi dalla coda
          await this.db!.delete('pending-requests', request.id);
          console.error(`Request failed with ${response.status}:`, request);
        }
      } catch (error) {
        // Network error - mantieni in coda
        console.error('Network error, keeping in queue:', error);
      }
    }
  }

  async getPendingCount(): Promise<number> {
    if (!this.db) await this.init();
    return this.db!.count('pending-requests');
  }
}

export const offlineQueue = new OfflineQueueService();
```

```typescript
// frontend/src/sw-custom.ts - Service Worker Background Sync

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-pending-requests') {
    event.waitUntil(syncPendingRequests());
  }
});

async function syncPendingRequests() {
  // Importa e processa la coda
  const { offlineQueue } = await import('./services/offline-queue');
  await offlineQueue.processPendingRequests();
}
```

---

## RACCOMANDAZIONI PRIORITARIE

### Fase 1 - Critiche (Implementare Subito)
1. **Versionamento Tariffario** - Essenziale per conformità fiscale
2. **Validazione File Upload** - Vulnerabilità sicurezza critica
3. **Gestione Conflitti Esenzioni** - Bug calcolo economico
4. **Optimistic Locking** - Integrità dati multiutente

### Fase 2 - Importanti (Entro 2-4 settimane)
5. **JWT Refresh Token** - Sicurezza sessioni
6. **Caching PWA Corretto** - Funzionalità offline
7. **Storico Targa** - Tracciabilità
8. **Protezione Registrazione** - Sicurezza accessi

### Fase 3 - Miglioramenti (Backlog)
9. **Report Paginati** - Performance
10. **Background Sync** - UX offline
11. **Rate Limiting** - Sicurezza
12. **Audit Logging** - Compliance

---

## CONCLUSIONE

Il progetto Sissibol ha una buona base architetturale ma presenta criticità significative che richiedono intervento immediato, in particolare:

1. **Integrità dei dati storici** per conformità fiscale
2. **Sicurezza degli upload** per prevenire attacchi
3. **Coerenza logica delle esenzioni** per correttezza calcoli
4. **Gestione concorrenza** per ambienti multiutente

Le soluzioni fornite sono implementabili incrementalmente senza refactoring massiccio.
