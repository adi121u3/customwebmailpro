import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const KEY_FILE = path.join(DATA_DIR, '.mail-config.key');
const CONFIG_FILE = path.join(DATA_DIR, 'mail-config.enc');

function envConfig() {
  if (!process.env.MAIL_EMAIL || !process.env.MAIL_PASSWORD) return null;
  return {
    email: process.env.MAIL_EMAIL,
    senderName: process.env.MAIL_SENDER_NAME || '',
    password: process.env.MAIL_PASSWORD,
    imapHost: process.env.IMAP_HOST || 'secure.emailsrvr.com',
    imapPort: Number(process.env.IMAP_PORT || 993),
    imapSecure: process.env.IMAP_SECURE !== 'false',
    smtpHost: process.env.SMTP_HOST || 'secure.emailsrvr.com',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: process.env.SMTP_SECURE !== 'false',
    rejectUnauthorized: process.env.MAIL_REJECT_UNAUTHORIZED !== 'false',
    signatures: [],
    defaultSignatureId: '',
    signatureEnabled: false,
    signatureOnReply: false,
    signatureOnForward: false,
    signaturePlacement: 'above',
    defaultPriority: '3',
    defaultReadReceipt: false
  };
}

async function ensureKey(): Promise<Buffer> {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    return Buffer.from(await fs.readFile(KEY_FILE, 'utf8'), 'base64');
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    const key = crypto.randomBytes(32);
    await fs.writeFile(KEY_FILE, key.toString('base64'), { mode: 0o600, flag: 'wx' });
    return key;
  }
}

export async function saveMailConfig(config: any) {
  const key = await ensureKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  const payload = {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(payload), { mode: 0o600 });
}

export async function loadMailConfig() {
  const fromEnvironment = envConfig();
  if (fromEnvironment) return fromEnvironment;

  try {
    const [key, raw] = await Promise.all([
      ensureKey(),
      fs.readFile(CONFIG_FILE, 'utf8')
    ]);
    const payload = JSON.parse(raw);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function publicMailConfig(config: any) {
  if (!config) return {
    configured: false,
    signatures: [],
    defaultSignatureId: '',
    signatureEnabled: false,
    signatureOnReply: false,
    signatureOnForward: false,
    signaturePlacement: 'above',
    defaultPriority: '3',
    defaultReadReceipt: false,
    senderName: '',
    email: ''
  };
  const {
    password: _password,
    googleClientSecret: _gSec,
    microsoftClientSecret: _mSec,
    calendarClientSecret: _cSec,
    contactsClientSecret: _coSec,
    ...safe
  } = config;
  return {
    configured: true,
    signatures: [],
    defaultSignatureId: '',
    signatureEnabled: false,
    signatureOnReply: false,
    signatureOnForward: false,
    signaturePlacement: 'above',
    defaultPriority: '3',
    defaultReadReceipt: false,
    ...safe
  };
}
