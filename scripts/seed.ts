/**
 * Crée le premier opérateur (ou superadmin) à partir de variables
 * d'environnement. À lancer dans le conteneur, après les migrations :
 *
 *   docker compose run --rm \
 *     -e SEED_EMAIL=op@example.com -e SEED_PASSWORD='motdepasse-fort' \
 *     app npm run db:seed
 *
 * SEED_ROLE vaut 'operator' par défaut ('superadmin' possible).
 */
import { eq } from 'drizzle-orm';
import { createUser } from '../src/lib/server/auth';
import { db } from '../src/lib/server/db';
import { users } from '../src/lib/server/db/schema';

const email = process.env.SEED_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_PASSWORD;
const role = (process.env.SEED_ROLE ?? 'operator') as 'superadmin' | 'operator';

if (!email || !password) {
	console.error('SEED_EMAIL et SEED_PASSWORD sont requis.');
	process.exit(1);
}
if (role !== 'operator' && role !== 'superadmin') {
	console.error(`SEED_ROLE invalide : ${role} (attendu 'operator' ou 'superadmin').`);
	process.exit(1);
}

const existing = db.select().from(users).where(eq(users.email, email)).get();
if (existing) {
	console.log(`Utilisateur ${email} déjà présent, rien à faire.`);
	process.exit(0);
}

await createUser(email, password, role);
console.log(`Opérateur créé : ${email} (${role}).`);
process.exit(0);
