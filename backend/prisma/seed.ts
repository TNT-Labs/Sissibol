import { PrismaClient, Ruolo } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Inizializzazione del database...');

  // Verifica se esiste già un utente admin
  const existingAdmin = await prisma.utente.findFirst({
    where: { ruolo: Ruolo.ADMIN },
  });

  if (existingAdmin) {
    console.log('✅ Utente admin già esistente');
    return;
  }

  // Crea utente admin di default
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.utente.create({
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
}

main()
  .catch((e) => {
    console.error('❌ Errore durante il seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
