import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

export function parseEncryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}

export function encryptSecret(plaintext: string, encodedKey: string): string {
  const key = parseEncryptionKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(envelope: string, encodedKey: string): string {
  const [version, ivPart, tagPart, dataPart] = envelope.split('.');
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error('Invalid encrypted envelope.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    parseEncryptionKey(encodedKey),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
