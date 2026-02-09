/**
 * Import all PDFs from src/salaries/ into the database.
 * Maps filenames to year_key: 2021 -> 4, 2023 -> 2, 2024 -> 1.
 * Run from backend dir: npm run import:pdf:all
 * With Docker: docker compose exec backend npm run import:pdf:all
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const salariesDir = path.join(__dirname, '..', 'salaries');

const FILE_YEAR = [
  ['salary-disclosure-2021.pdf', 4, 'compact'],
  ['salary-disclosure-2023.pdf', 2, 'compact'],
  ['salary_disclosure_2024.pdf', 1, 'line'],
];

function runOne(fileName, yearKey, format) {
  const filePath = path.join(salariesDir, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn('Skip (not found): %s', filePath);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const env = { ...process.env, FILE: filePath, YEAR: String(yearKey), FORMAT: format };
    const child = spawn(process.execPath, [path.join(__dirname, 'import-from-pdf.js')], {
      env,
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..'),
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  console.log('Importing all PDFs from %s', salariesDir);
  for (const [fileName, yearKey, format] of FILE_YEAR) {
    console.log('\n--- %s (year_key=%s, format=%s) ---', fileName, yearKey, format);
    try {
      await runOne(fileName, yearKey, format);
    } catch (e) {
      console.error('Failed:', e.message);
      process.exitCode = 1;
    }
  }
  console.log('\nAll PDF imports finished.');
}

main();
