#!/bin/bash
#
# Script di importazione database MDB in Sissibol
#
# Prerequisiti:
#   - mdbtools installato (apt-get install mdbtools)
#   - Database PostgreSQL avviato e configurato
#   - Prisma client generato (npm run prisma:generate)
#
# Utilizzo:
#   cd /path/to/Sissibol
#   ./import/import-mdb.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MDB_FILE="$SCRIPT_DIR/DB - Scadenziario Bolli.mdb"
CSV_DIR="$SCRIPT_DIR/csv"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     SISSIBOL - Import da Microsoft Access                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Verifica mdbtools
if ! command -v mdb-export &> /dev/null; then
    echo "❌ mdbtools non installato. Esegui: apt-get install mdbtools"
    exit 1
fi

# Verifica file MDB
if [ ! -f "$MDB_FILE" ]; then
    echo "❌ File MDB non trovato: $MDB_FILE"
    exit 1
fi

echo "📁 File MDB: $MDB_FILE"
echo ""

# Step 1: Esportazione CSV
echo "📤 Step 1: Esportazione tabelle MDB in CSV..."
mkdir -p "$CSV_DIR"

mdb-export "$MDB_FILE" Ditte > "$CSV_DIR/ditte.csv"
echo "   ✓ ditte.csv"

mdb-export "$MDB_FILE" Mezzi > "$CSV_DIR/mezzi.csv"
echo "   ✓ mezzi.csv"

mdb-export "$MDB_FILE" Scadenziario > "$CSV_DIR/scadenziario.csv"
echo "   ✓ scadenziario.csv"

mdb-export "$MDB_FILE" "Tipo mezzi" > "$CSV_DIR/tipo_mezzi.csv"
echo "   ✓ tipo_mezzi.csv"

mdb-export "$MDB_FILE" Regioni > "$CSV_DIR/regioni.csv"
echo "   ✓ regioni.csv"

mdb-export "$MDB_FILE" Marca > "$CSV_DIR/marca.csv"
echo "   ✓ marca.csv"

echo ""
echo "📥 Step 2: Importazione in PostgreSQL..."
echo ""

cd "$PROJECT_DIR/backend"

# Verifica che prisma sia generato
if [ ! -d "node_modules/.prisma" ]; then
    echo "   Generazione Prisma client..."
    npm run prisma:generate
fi

# Esegui import
npm run prisma:import-mdb

echo ""
echo "✅ Import completato!"
echo ""
echo "Puoi verificare i dati con: npm run prisma:studio"
