## 1. Aggiorna il codice
git pull

## 2. Ricostruisci e riavvia tutto con database pulito
docker-compose down -v
docker-compose build backend
docker-compose up -d

## 3. Applica le migrazioni
docker exec -it sissibol-backend npm run prisma:migrate:deploy

## 4. Crea utente admin
docker exec -it sissibol-backend npm run prisma:seed

## 5. Esegui l'import
docker exec -it sissibol-backend npm run prisma:import-mdb



# Installazione Pulita con Docker
## 1. Reset completo del database (elimina, ricrea schema, applica seed)
docker exec -it sissibol-backend npx prisma migrate reset --force

## 2. Importa i dati dai CSV
docker exec -it sissibol-backend npm run prisma:import-mdb


# Eliminare le scadenze >  di un anno indicato

## Esegui nel container Docker del database
docker exec -it sissibol-db-1 psql -U sissibol -d sissibol -c "DELETE FROM scadenze WHERE \"annoScadenza\" > 2028;"

Se vuoi prima vedere quante scadenze verranno eliminate:

## Count prima di eliminare
docker exec -it sissibol-db-1 psql -U sissibol -d sissibol -c "SELECT COUNT(*) FROM scadenze WHERE \"annoScadenza\" > 2028;"

Se il nome del container è diverso, puoi trovarlo con:

docker ps | grep postgres
