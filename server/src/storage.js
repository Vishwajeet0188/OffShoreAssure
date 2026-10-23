/* Document storage on disk, encrypted at rest with AES-256-GCM (file = 12-byte IV | 16-byte tag | ciphertext).
   The SHA-256 fingerprint recorded in the database is of the original (plain) file, so integrity can be checked after decryption. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const key = () => config.storageKey === 'derive'
  ? crypto.createHash('sha256').update('offshoreassure-storage:' + config.jwtSecret).digest()
  : Buffer.from(config.storageKey, 'hex');

export async function saveFile(storageKey, plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  const file = path.join(config.storageDir, storageKey);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.concat([iv, c.getAuthTag(), enc]), { mode: 0o600 });
}

export async function readFile(storageKey, encrypted = true) {
  const buf = await fs.readFile(path.join(config.storageDir, storageKey));
  if (!encrypted) return buf;
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

export const removeFile = storageKey => fs.rm(path.join(config.storageDir, storageKey), { force: true });
