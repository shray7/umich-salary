import 'dotenv/config';
import { initDb } from './pool.js';

async function main() {
  await initDb();
  console.log('Database initialized.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
