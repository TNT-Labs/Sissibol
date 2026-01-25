# HTTPS Setup con DuckDNS e Let's Encrypt

Questa guida spiega come configurare Sissibol per funzionare via HTTPS usando DuckDNS e certificati Let's Encrypt, **senza bisogno di aprire la porta 80**.

## Panoramica

La configurazione utilizza:
- **DuckDNS**: DNS dinamico gratuito per il dominio
- **Let's Encrypt**: Certificati SSL gratuiti
- **DNS-01 Challenge**: Validazione via DNS (non richiede porta 80)
- **nginx**: Reverse proxy con hardening di sicurezza

## Prerequisiti

1. Un account DuckDNS (gratuito su https://www.duckdns.org)
2. Docker Desktop installato (Windows/Mac) o Docker + Docker Compose (Linux)
3. Porta 443 aperta sul router e inoltrata al server

> **Nota**: Questa guida supporta sia Linux/Mac (Bash) che Windows (PowerShell). Gli script sono disponibili in entrambi i formati.

## Configurazione Rapida

### 1. Registra un dominio DuckDNS

1. Vai su https://www.duckdns.org e accedi
2. Crea un nuovo sottodominio (es. `miaapp`)
3. Copia il tuo **token** dalla pagina principale
4. Il tuo dominio sarà: `miaapp.duckdns.org`

### 2. Configura le variabili d'ambiente

**Linux/Mac:**
```bash
# Copia il file di esempio
cp .env.https.example .env

# Modifica il file con i tuoi valori
nano .env
```

**Windows (PowerShell):**
```powershell
# Copia il file di esempio
Copy-Item .env.https.example .env

# Modifica il file con Notepad o VS Code
notepad .env
# oppure
code .env
```

**Valori da configurare obbligatoriamente:**

```ini
# DuckDNS
DUCKDNS_SUBDOMAIN=miaapp          # Il tuo sottodominio
DUCKDNS_TOKEN=xxxxxxxx-xxxx-xxxx  # Il tuo token DuckDNS

# Email per notifiche certificato
CERT_EMAIL=tua@email.com

# Sicurezza - CAMBIA QUESTI VALORI!
# Genera password sicure con: [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
POSTGRES_PASSWORD=genera_una_password_sicura_qui
JWT_SECRET=genera_un_secret_sicuro_di_64_caratteri_qui
```

### 3. Genera i certificati SSL

**Linux/Mac:**
```bash
./scripts/ssl/init-ssl.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\ssl\init-ssl.ps1
```

Questo script:
- Aggiorna il tuo IP su DuckDNS
- Genera i parametri Diffie-Hellman (2048 bit)
- Ottiene un certificato Let's Encrypt via DNS challenge

### 4. Avvia l'applicazione

```bash
# Avvia con Docker Compose
docker compose -f docker-compose.https.yml up -d

# Verifica che tutto funzioni
docker compose -f docker-compose.https.yml ps
```

### 5. Accedi all'applicazione

Apri nel browser: `https://tuodominio.duckdns.org`

## Architettura di Sicurezza

```
                    Internet
                        │
                        │ HTTPS (443)
                        ▼
            ┌───────────────────────┐
            │     nginx (HTTPS)     │
            │   TLS 1.2/1.3 only    │
            │   Strong ciphers      │
            │   HSTS enabled        │
            │   Security headers    │
            └───────────┬───────────┘
                        │ HTTP (interno)
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               │
┌───────────────┐ ┌───────────────┐     │
│   Frontend    │ │   Backend     │     │
│   (Static)    │ │   (NestJS)    │     │
└───────────────┘ └───────┬───────┘     │
                          │             │
                          ▼             │
                  ┌───────────────┐     │
                  │   PostgreSQL  │     │
                  │  (isolato)    │     │
                  └───────────────┘     │
                                        │
            ─────────────────────────────
                  Rete Interna Docker
                (non esposta all'esterno)
```

## Misure di Sicurezza Implementate

### TLS/SSL
- Solo TLS 1.2 e 1.3 supportati
- Cipher suite moderne (Mozilla "Modern" configuration)
- OCSP Stapling abilitato
- DH parameters a 2048 bit
- HSTS con preload (2 anni)

### HTTP Headers
- `Strict-Transport-Security`: Forza HTTPS
- `X-Frame-Options`: Previene clickjacking
- `X-Content-Type-Options`: Previene MIME sniffing
- `X-XSS-Protection`: Protezione XSS legacy
- `Referrer-Policy`: Limita informazioni referrer
- `Permissions-Policy`: Disabilita funzionalità browser non necessarie
- `Content-Security-Policy`: Previene XSS e data injection

### Rate Limiting
- API: 5 richieste/secondo per IP
- Generale: 10 richieste/secondo per IP
- Login: 30 richieste/minuto per IP (anti-brute force)

### Isolamento di Rete
- PostgreSQL accessibile solo dalla rete interna Docker
- Backend non esposto direttamente all'esterno
- Solo porta 443 esposta pubblicamente

### Container Security
- `no-new-privileges`: Previene escalation privilegi
- Limiti risorse CPU/memoria
- Health checks abilitati

## Gestione Certificati

### Rinnovo Automatico

Il container `certbot` rinnova automaticamente i certificati prima della scadenza (ogni 12 ore verifica se necessario).

### Rinnovo Manuale

**Linux/Mac:**
```bash
./scripts/ssl/renew-ssl.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\ssl\renew-ssl.ps1
```

### Verifica Stato Certificato

**Linux/Mac:**
```bash
./scripts/ssl/check-ssl.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\ssl\check-ssl.ps1
```

### Test SSL Completo

Usa SSL Labs per un test approfondito:
```
https://www.ssllabs.com/ssltest/analyze.html?d=tuodominio.duckdns.org
```

## Troubleshooting

### Errore "Certificate not found"

Il certificato non è stato generato. Esegui:

**Linux/Mac:**
```bash
./scripts/ssl/init-ssl.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\ssl\init-ssl.ps1
```

### Errore "DNS propagation"

La DNS challenge può fallire se il DNS non si propaga in tempo. Soluzioni:
1. Riprova dopo alcuni minuti
2. Aumenta il tempo di attesa nello script (modifica `sleep 60` a `sleep 120`)
3. Verifica che il token DuckDNS sia corretto

### Errore "Port 443 already in use"

**Linux/Mac:**
```bash
# Trova cosa usa la porta
sudo lsof -i :443

# Ferma il servizio o cambia porta
```

**Windows (PowerShell come Amministratore):**
```powershell
# Trova cosa usa la porta
netstat -ano | findstr :443

# Trova il processo dal PID
Get-Process -Id <PID>

# Oppure
Get-NetTCPConnection -LocalPort 443 | Select-Object OwningProcess
```

### Certificato scaduto

```bash
# Forza il rinnovo
./scripts/ssl/renew-ssl.sh

# Riavvia nginx
docker compose -f docker-compose.https.yml restart frontend
```

### Verificare i log

```bash
# Log nginx
docker logs sissibol-frontend

# Log certbot
docker logs sissibol-certbot

# Tutti i log
docker compose -f docker-compose.https.yml logs -f
```

## Aggiornamento IP Dinamico

Se hai un IP dinamico, configura un task schedulato per aggiornare DuckDNS.

**Linux/Mac (cron):**
```bash
# Crea lo script
cat > /home/user/update-duckdns.sh << 'EOF'
#!/bin/bash
source /path/to/Sissibol/.env
curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip="
EOF

chmod +x /home/user/update-duckdns.sh

# Aggiungi al crontab (ogni 5 minuti)
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/user/update-duckdns.sh") | crontab -
```

**Windows (Task Scheduler via PowerShell):**

1. Crea lo script `update-duckdns.ps1`:
```powershell
# Percorso: C:\Sissibol\scripts\update-duckdns.ps1
$EnvFile = "C:\path\to\Sissibol\.env"
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
}
Invoke-RestMethod -Uri "https://www.duckdns.org/update?domains=$env:DUCKDNS_SUBDOMAIN&token=$env:DUCKDNS_TOKEN&ip="
```

2. Crea il task schedulato (esegui PowerShell come Amministratore):
```powershell
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File C:\Sissibol\scripts\update-duckdns.ps1"
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "DuckDNS Update" -Action $Action -Trigger $Trigger -Settings $Settings -RunLevel Highest
```

## Comandi Utili

I comandi Docker sono identici su tutti i sistemi operativi:

```powershell
# Avvia stack HTTPS
docker compose -f docker-compose.https.yml up -d

# Ferma stack
docker compose -f docker-compose.https.yml down

# Riavvia solo nginx
docker compose -f docker-compose.https.yml restart frontend

# Rebuild completo
docker compose -f docker-compose.https.yml up -d --build

# Verifica configurazione nginx
docker exec sissibol-frontend nginx -t

# Visualizza log in tempo reale
docker compose -f docker-compose.https.yml logs -f
```

**Visualizzare il certificato:**

*Linux/Mac:*
```bash
openssl x509 -in letsencrypt/live/tuodominio.duckdns.org/fullchain.pem -text -noout
```

*Windows (usando Docker):*
```powershell
docker run --rm -v "${PWD}/letsencrypt:/certs:ro" alpine/openssl x509 -in /certs/live/tuodominio.duckdns.org/fullchain.pem -text -noout
```

## Migrazione da HTTP a HTTPS

Se hai già un'installazione HTTP funzionante:

1. Ferma l'applicazione HTTP:
   ```bash
   docker compose down
   ```

2. Configura e genera certificati (vedi sopra)

3. Avvia con HTTPS:
   ```bash
   docker compose -f docker-compose.https.yml up -d
   ```

4. Aggiorna il port forwarding del router:
   - Rimuovi forwarding porta 80
   - Aggiungi forwarding porta 443

## Best Practices Aggiuntive

1. **Backup certificati**: Salva periodicamente la cartella `letsencrypt/`
2. **Monitoraggio**: Configura alert per scadenza certificati
3. **Password sicure**: Usa password generate (`openssl rand -base64 32`)
4. **Aggiornamenti**: Mantieni Docker e le immagini aggiornate
5. **Firewall**: Configura iptables/ufw per bloccare porte non necessarie
