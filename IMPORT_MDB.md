# 1. Aggiorna il codice
git pull

# 2. Ricostruisci e riavvia tutto con database pulito
docker-compose down -v
docker-compose build backend
docker-compose up -d

# 3. Applica le migrazioni
docker exec -it sissibol-backend npm run prisma:migrate:deploy

# 4. Crea utente admin
docker exec -it sissibol-backend npm run prisma:seed

# 5. Esegui l'import
docker exec -it sissibol-backend npm run prisma:import-mdb
