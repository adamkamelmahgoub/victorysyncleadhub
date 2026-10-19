import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error('TOKEN_ENCRYPTION_KEY is missing');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return decoded;
}
export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}
export function decryptToken(ciphertext: string): string {
  const [prefix, version, iv, tag, data] = ciphertext.split(':');
  if (prefix !== 'enc' || version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
