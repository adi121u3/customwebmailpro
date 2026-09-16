import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { AppError } from '../../backend/errors.js';

const DEFAULT_DB = path.join(process.cwd(), 'data', 'customwebmail.sqlite');

function json(value: string, fallback = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}

const RETRY_DELAYS_SECONDS = [0, 30, 120, 600, 1800, 7200];

function isTemporaryError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  if (['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET'].includes(code)) return true;
  if (/timeout|socket|connection refused|reset|dns|temporary|421|try again/i.test(msg)) return true;
  if (/535|authentication|550|mailbox unavailable|user unknown|invalid recipient/i.test(msg)) return false;
  if (/^5\d\d/.test(code) || /5\d\d/.test(msg)) return false;
  return true;
}

function now() { return new Date().toISOString(); }

export class LocalMailStore {
  db: any;
  constructor(fileName = process.env.LOCAL_MAIL_DB || DEFAULT_DB) {
    fs.mkdirSync(path.dirname(fileName), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(fileName);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        folder TEXT NOT NULL CHECK(folder IN ('sent','drafts')),
        status TEXT NOT NULL CHECK(status IN ('draft','sending','sent','failed')),
        operation TEXT NOT NULL,
        provider TEXT,
        from_address TEXT NOT NULL DEFAULT '',
        from_name TEXT NOT NULL DEFAULT '',
        to_json TEXT NOT NULL DEFAULT '[]',
        cc_json TEXT NOT NULL DEFAULT '[]',
        bcc_json TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        html_body TEXT NOT NULL DEFAULT '',
        text_body TEXT NOT NULL DEFAULT '',
        attachments_json TEXT NOT NULL DEFAULT '[]',
        provider_context_json TEXT NOT NULL DEFAULT '{}',
        provider_message_id TEXT,
        error_message TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        attempted_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS messages_folder_created ON messages(folder, created_at DESC);
      CREATE TABLE IF NOT EXISTS delivery_jobs (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        locked_at TEXT,
        next_retry_at TEXT,
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS jobs_status_created ON delivery_jobs(status, created_at);
      CREATE TABLE IF NOT EXISTS uid_mappings (
        id TEXT PRIMARY KEY,
        imap_folder TEXT NOT NULL,
        imap_uid_validity TEXT NOT NULL,
        imap_uid TEXT NOT NULL,
        rackspace_folder TEXT NOT NULL,
        rackspace_uid TEXT NOT NULL,
        message_id_header TEXT,
        evidence TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        UNIQUE(imap_folder, imap_uid_validity, imap_uid)
      );
    `);
    const columns = this.db.prepare('PRAGMA table_info(messages)').all().map((column: any) => column.name);
    if (!columns.includes('from_name')) this.db.exec("ALTER TABLE messages ADD COLUMN from_name TEXT NOT NULL DEFAULT ''");
    const jobColumns = this.db.prepare('PRAGMA table_info(delivery_jobs)').all().map((column: any) => column.name);
    if (!jobColumns.includes('next_retry_at')) this.db.exec("ALTER TABLE delivery_jobs ADD COLUMN next_retry_at TEXT");
    const timestamp = now();
    this.db.prepare("UPDATE delivery_jobs SET status='queued', locked_at=NULL, updated_at=? WHERE status='processing'").run(timestamp);
    this.db.prepare("UPDATE messages SET status='sending', updated_at=? WHERE status='sending' AND id IN (SELECT message_id FROM delivery_jobs WHERE status='queued')").run(timestamp);
  }

  close() { this.db.close(); }

  row(row: any, full = false) {
    if (!row) return null;
    const attachments = json(row.attachments_json);
    return {
      id: row.id,
      source: 'local',
      folder: row.folder,
      status: row.status,
      operation: row.operation,
      provider: row.provider,
      from: row.from_address,
      fromName: row.from_name,
      to: json(row.to_json), cc: json(row.cc_json), bcc: json(row.bcc_json),
      subject: row.subject,
      ...(full ? { html: row.html_body, text: row.text_body, attachments, providerContext: json(row.provider_context_json, {} as any) } : {
        attachments: attachments.map(({ contentBase64: _content, ...metadata }: any) => metadata)
      }),
      messageId: row.provider_message_id,
      error: row.error_message,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      attemptedAt: row.attempted_at,
      completedAt: row.completed_at,
      date: row.created_at,
      read: true
    };
  }

  getMessage(id: string, full = true) {
    return this.row(this.db.prepare('SELECT * FROM messages WHERE id=?').get(id), full);
  }

  listMessages(folder: string) {
    return this.db.prepare('SELECT * FROM messages WHERE folder=? ORDER BY created_at DESC').all(folder).map((row: any) => this.row(row));
  }

  createDraft(message: any) {
    const id = crypto.randomUUID();
    const timestamp = now();
    this.insertMessage({ id, folder: 'drafts', status: 'draft', operation: message.operation || 'new', provider: null, message, timestamp });
    return this.getMessage(id);
  }

  updateDraft(id: string, message: any) {
    const existing = this.getMessage(id);
    if (!existing || existing.folder !== 'drafts') throw new AppError(404, 'DRAFT_NOT_FOUND', 'Draft not found.');
    this.db.prepare(`UPDATE messages SET from_address=?,from_name=?,to_json=?,cc_json=?,bcc_json=?,subject=?,html_body=?,text_body=?,attachments_json=?,provider_context_json=?,updated_at=? WHERE id=?`)
      .run(message.from || '', message.fromName || '', JSON.stringify(message.to), JSON.stringify(message.cc), JSON.stringify(message.bcc), message.subject, message.html || '', message.text || '', JSON.stringify(message.attachments || []), JSON.stringify(message.providerContext || {}), now(), id);
    return this.getMessage(id);
  }

  deleteDraft(id: string) {
    const result = this.db.prepare("DELETE FROM messages WHERE id=? AND folder='drafts'").run(id);
    if (!result.changes) throw new AppError(404, 'DRAFT_NOT_FOUND', 'Draft not found.');
  }

  createOutgoing({ provider, operation, message }: any) {
    const id = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const timestamp = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.insertMessage({ id, folder: 'sent', status: 'sending', operation, provider, message, timestamp });
      this.db.prepare('INSERT INTO delivery_jobs(id,message_id,status,attempts,created_at,updated_at) VALUES(?,?,\'queued\',0,?,?)')
        .run(jobId, id, timestamp, timestamp);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getMessage(id, false);
  }

  insertMessage({ id, folder, status, operation, provider, message, timestamp }: any) {
    this.db.prepare(`INSERT INTO messages(id,folder,status,operation,provider,from_address,from_name,to_json,cc_json,bcc_json,subject,html_body,text_body,attachments_json,provider_context_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, folder, status, operation, provider, message.from || '', message.fromName || '', JSON.stringify(message.to), JSON.stringify(message.cc), JSON.stringify(message.bcc), message.subject, message.html || '', message.text || '', JSON.stringify(message.attachments || []), JSON.stringify(message.providerContext || {}), timestamp, timestamp);
  }

  claimJob() {
    const timestamp = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const job: any = this.db.prepare("SELECT * FROM delivery_jobs WHERE status='queued' AND (next_retry_at IS NULL OR next_retry_at <= ?) ORDER BY created_at LIMIT 1").get(timestamp);
      if (!job) { this.db.exec('COMMIT'); return null; }
      this.db.prepare("UPDATE delivery_jobs SET status='processing', attempts=attempts+1, locked_at=?, updated_at=? WHERE id=? AND status='queued'").run(timestamp, timestamp, job.id);
      this.db.prepare('UPDATE messages SET status=\'sending\',attempt_count=attempt_count+1,attempted_at=?,updated_at=?,error_message=NULL WHERE id=?').run(timestamp, timestamp, job.message_id);
      this.db.exec('COMMIT');
      return { ...job, status: 'processing', attempts: job.attempts + 1, message: this.getMessage(job.message_id) };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  completeJob(job: any, result: any = {}) {
    const timestamp = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare("UPDATE delivery_jobs SET status='completed',updated_at=?,locked_at=NULL,error_message=NULL,next_retry_at=NULL WHERE id=?").run(timestamp, job.id);
      this.db.prepare("UPDATE messages SET status='sent',provider_message_id=?,completed_at=?,updated_at=?,error_message=NULL WHERE id=?")
        .run(result.messageId || null, timestamp, timestamp, job.message_id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  failJob(job: any, error: any) {
    const timestamp = now();
    const attempts = job.attempts || 1;
    const isTemp = isTemporaryError(error);
    const safeError = String(error?.message || 'Delivery failed').slice(0, 2000);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (isTemp && attempts < 6) {
        const delaySec = RETRY_DELAYS_SECONDS[attempts] || 7200;
        const nextRetryAt = new Date(Date.now() + delaySec * 1000).toISOString();
        const errDesc = `Temporary failure—retrying (Attempt ${attempts}/6 in ${Math.round(delaySec / 60)}m): ${safeError}`;
        this.db.prepare("UPDATE delivery_jobs SET status='queued', updated_at=?, locked_at=NULL, next_retry_at=?, error_message=? WHERE id=?")
          .run(timestamp, nextRetryAt, errDesc, job.id);
        this.db.prepare("UPDATE messages SET status='failed', updated_at=?, error_message=? WHERE id=?")
          .run(timestamp, errDesc, job.message_id);
      } else {
        const errDesc = `Permanent failure (Attempts: ${attempts}): ${safeError}`;
        this.db.prepare("UPDATE delivery_jobs SET status='failed', updated_at=?, locked_at=NULL, error_message=? WHERE id=?")
          .run(timestamp, errDesc, job.id);
        this.db.prepare("UPDATE messages SET status='failed', completed_at=?, updated_at=?, error_message=? WHERE id=?")
          .run(timestamp, timestamp, errDesc, job.message_id);
      }
      this.db.exec('COMMIT');
    } catch (databaseError) { this.db.exec('ROLLBACK'); throw databaseError; }
  }

  retryMessage(id: string) {
    const message = this.getMessage(id);
    if (!message || message.folder !== 'sent') throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Local message not found.');
    if (message.status !== 'failed') throw new AppError(409, 'MESSAGE_NOT_FAILED', 'Only failed messages can be retried.');
    const timestamp = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare("UPDATE messages SET status='sending',error_message=NULL,completed_at=NULL,updated_at=? WHERE id=?").run(timestamp, id);
      this.db.prepare("INSERT INTO delivery_jobs(id,message_id,status,attempts,created_at,updated_at) VALUES(?,?, 'queued',0,?,?)").run(crypto.randomUUID(), id, timestamp, timestamp);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.getMessage(id, false);
  }

  resolveUidMapping({ imapFolder, uidValidity, imapUid }: any) {
    return this.db.prepare('SELECT * FROM uid_mappings WHERE imap_folder=? AND imap_uid_validity=? AND imap_uid=?')
      .get(imapFolder, String(uidValidity), String(imapUid)) || null;
  }

  saveVerifiedUidMapping({ imapFolder, uidValidity, imapUid, rackspaceFolder, rackspaceUid, messageIdHeader = null, evidence }: any) {
    if (!evidence) throw new AppError(400, 'UID_MAPPING_EVIDENCE_REQUIRED', 'UID mapping evidence is required.');
    const id = crypto.randomUUID();
    this.db.prepare(`INSERT INTO uid_mappings(id,imap_folder,imap_uid_validity,imap_uid,rackspace_folder,rackspace_uid,message_id_header,evidence,verified_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(imap_folder,imap_uid_validity,imap_uid) DO UPDATE SET rackspace_folder=excluded.rackspace_folder,rackspace_uid=excluded.rackspace_uid,message_id_header=excluded.message_id_header,evidence=excluded.evidence,verified_at=excluded.verified_at`)
      .run(id, imapFolder, String(uidValidity), String(imapUid), rackspaceFolder, String(rackspaceUid), messageIdHeader, evidence, now());
    return this.resolveUidMapping({ imapFolder, uidValidity, imapUid });
  }
}

let singleton: LocalMailStore;
export function getLocalMailStore() {
  if (!singleton) singleton = new LocalMailStore();
  return singleton;
}
