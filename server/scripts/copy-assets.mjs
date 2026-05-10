import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.resolve(__dirname, '..', 'src', 'db', 'schema.sql');
const destDir = path.resolve(__dirname, '..', 'dist', 'db');
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'schema.sql'));
console.log(`Copied schema.sql to ${destDir}`);
