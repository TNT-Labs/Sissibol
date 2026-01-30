# Import Database MDB

Questa cartella contiene gli strumenti per importare dati da un database Microsoft Access (.mdb) in Sissibol.

## Quick Start (Windows + Docker)

```powershell
# 1. Avvia i container Docker
docker-compose up -d

# 2. Esegui l'import dal container backend
docker exec -it sissibol-backend npm run prisma:import-mdb
```

I file CSV sono già inclusi nel repository, quindi non serve esportarli manualmente.

---

## Struttura

```
import/
├── DB - Scadenziario Bolli.mdb    # Database Access sorgente
├── import-mdb.sh                   # Script di importazione automatico
├── csv/                            # File CSV esportati (generati automaticamente)
│   ├── ditte.csv
│   ├── mezzi.csv
│   ├── scadenziario.csv
│   ├── tipo_mezzi.csv
│   ├── regioni.csv
│   └── marca.csv
└── README.md                       # Questa documentazione
```

## Prerequisiti

1. **mdbtools** - Utility per leggere database Access su Linux
   ```bash
   sudo apt-get install mdbtools
   ```

2. **Database PostgreSQL** avviato e configurato (vedi configurazione Docker nel progetto principale)

3. **Migrazioni Prisma** applicate
   ```bash
   cd backend
   npm run prisma:migrate:deploy
   ```

## Utilizzo

### Metodo 1: Script automatico (consigliato)

```bash
cd /path/to/Sissibol
./import/import-mdb.sh
```

Lo script:
1. Esporta le tabelle MDB in CSV
2. Importa i dati in PostgreSQL via Prisma

### Metodo 2: Manuale

```bash
# 1. Esporta CSV (se non già fatto)
cd import
mdb-export "DB - Scadenziario Bolli.mdb" Ditte > csv/ditte.csv
mdb-export "DB - Scadenziario Bolli.mdb" Mezzi > csv/mezzi.csv
mdb-export "DB - Scadenziario Bolli.mdb" Scadenziario > csv/scadenziario.csv
mdb-export "DB - Scadenziario Bolli.mdb" "Tipo mezzi" > csv/tipo_mezzi.csv
mdb-export "DB - Scadenziario Bolli.mdb" Regioni > csv/regioni.csv
mdb-export "DB - Scadenziario Bolli.mdb" Marca > csv/marca.csv

# 2. Importa in PostgreSQL
cd ../backend
npm run prisma:import-mdb
```

## Mapping Dati

### Ditte → Clienti

| Campo MDB | Campo Sissibol |
|-----------|----------------|
| Cod_ditta | (interno) |
| Ditta | ragioneSociale |
| Email | email |

Tutti i record vengono importati come `PERSONA_GIURIDICA`.

### Mezzi → Veicoli

| Campo MDB | Campo Sissibol |
|-----------|----------------|
| Targa | targa |
| Tipo | tipoVeicolo (via lookup) |
| Ditta | idCliente (FK) |
| KW | potenzaKw |
| Data_Immatricolazione | dataImmatricolazione |
| NumAssi | numeroAssi |
| SospPneum | tipoSospensione |
| Regione | regione (via lookup) |

### Scadenziario → Scadenze + Pagamenti

| Campo MDB | Campo Sissibol |
|-----------|----------------|
| Targa | idVeicolo (FK via targa) |
| Scadenza | meseScadenza, annoScadenza |
| Bollo | importoPrevisto |
| Data_pagamento | pagamenti.dataPagamento |

Lo stato della scadenza viene determinato automaticamente:
- `PAGATO` se presente Data_pagamento
- `SCADUTO` se la scadenza è nel passato
- `DA_PAGARE` altrimenti

## Windows + Docker

Su Windows non è necessario installare `mdbtools` perché i file CSV sono già inclusi nel repository.

### Passi:

1. **Avvia i container Docker** (se non già avviati):
   ```powershell
   docker-compose up -d
   ```

2. **Verifica che le migrazioni siano applicate**:
   ```powershell
   docker exec -it sissibol-backend npm run prisma:migrate:deploy
   ```

3. **Esegui l'import**:
   ```powershell
   docker exec -it sissibol-backend npm run prisma:import-mdb
   ```

4. **Verifica i dati** (opzionale):
   ```powershell
   docker exec -it sissibol-backend npm run prisma:studio
   ```
   Poi apri http://localhost:5555 nel browser.

### Aggiornare i CSV (se il file MDB cambia)

Se hai bisogno di ri-esportare i CSV da un nuovo file MDB:

**Opzione A - Da Linux/WSL:**
```bash
apt-get install mdbtools
mdb-export "DB - Scadenziario Bolli.mdb" Ditte > csv/ditte.csv
# ... (vedi sezione Linux sotto)
```

**Opzione B - Da Microsoft Access:**
1. Apri il file .mdb con Access
2. Esporta ogni tabella in formato CSV (File → Esporta → CSV)
3. Assicurati che i nomi file corrispondano: `ditte.csv`, `mezzi.csv`, etc.

## Note

- L'importazione è **one-shot**: eseguirla su un database vuoto
- I record duplicati (stessa targa + mese + anno) vengono consolidati
- Le targhe vengono normalizzate in UPPERCASE
- Le date MDB (formato MM/DD/YY) vengono convertite correttamente

## Verifica

Dopo l'import, verifica i dati con Prisma Studio:

```bash
cd backend
npm run prisma:studio
```

Oppure via query:

```bash
# Conta record importati
docker exec -it sissibol-db psql -U sissibol -d sissibol -c "
  SELECT 'Clienti' as tabella, COUNT(*) as record FROM clienti
  UNION ALL
  SELECT 'Veicoli', COUNT(*) FROM veicoli
  UNION ALL
  SELECT 'Scadenze', COUNT(*) FROM scadenze
  UNION ALL
  SELECT 'Pagamenti', COUNT(*) FROM pagamenti;
"
```
