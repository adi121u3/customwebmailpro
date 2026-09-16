import 'dotenv/config';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { loadMailConfig, publicMailConfig, saveMailConfig } from './backend/config-store.js';
import { autoDiscoverConfig } from './src/autodiscover';
import { AppError, publicError } from './backend/errors.js';
import {
  getAttachment,
  getMessage,
  bulkMessageAction,
  listFolders,
  listMessages,
  moveMessage,
  sendMessage,
  setReadState,
  verifySettings
} from './backend/mail-service.js';
import {
  folderQuerySchema,
  messageQuerySchema,
  parse,
  sendSchema,
  settingsSchema
} from './backend/schemas.js';
import { draftSchema, localAttachmentSchema, outgoingSchema, rackspaceChangeBodyTypeSchema, rackspaceComposeLoadSchema, rackspaceComposeMutationSchema, rackspaceResendSchema, rackspaceSendResendSchema } from './backend/schemas.js';
import { changeComposeBodyType, deleteRackspaceDraft, getComposeMessage, getResendMessage, saveDraftWithExpandedAddresses, sendComposeOperation, sendResend } from './rackspace/router/compose.js';
import { deleteRackspaceMessages, moveRackspaceMessages, setRackspaceFlag, setRackspaceReadStatus } from './rackspace/router/mail.js';
import { getRackspaceFolderStatuses, getRackspaceMessage, getRackspaceMessages } from './rackspace/router/messages.js';
import { rackspaceSessionStatus } from './rackspace/session-context.js';
import { RackspaceSessionExtension } from './rackspace/session-extension.js';
import { uploadRackspaceAttachment } from './rackspace/router/attachments.js';
import { getLocalMailStore } from './services/mail/local-store.js';
import { DeliveryWorker } from './services/mail/delivery-worker.js';
import { createServer as createViteServer } from 'vite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST_PATH = fs.existsSync(path.join(ROOT, 'index.html')) ? ROOT : path.join(ROOT, 'dist');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const APP_TOKEN = process.env.APP_TOKEN || '';
const localStore = getLocalMailStore();
const rackspaceSessionExtension = new RackspaceSessionExtension();
const allowedOrigins = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  ...(process.env.FRONTEND_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean)
]);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    try {
      const url = new URL(origin);
      if (
        url.hostname.endsWith('.run.app') ||
        url.hostname.endsWith('.aistudio.google.com') ||
        url.hostname.endsWith('.ai.studio') ||
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1'
      ) {
        return callback(null, true);
      }
    } catch {}
    // Allow all origins in preview environment to prevent 403 Forbidden issues
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '30mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, validate: false }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'customwebmail', version: '2.5.1' });
});

app.post('/api/auth/logout', (_req, res, next) => {
  try {
    res.json({ ok: true, message: 'Successfully logged out.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/autodiscover', async (req, res, next) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address required' });
    }
    const result = autoDiscoverConfig(email);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/google/url', async (req, res, next) => {
  try {
    const config = await loadMailConfig();
    const clientId = config?.googleClientId || process.env.GOOGLE_CLIENT_ID || 'dummy_google_client_id.apps.googleusercontent.com';
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const scopes = [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/contacts.other.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent'
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (error) { next(error); }
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  res.send(`
    <html>
      <body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#f8fafc; color:#0f172a;">
        <div style="max-width:440px; margin:0 auto; background:white; padding:32px; border-radius:16px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="margin-bottom:12px; font-size:18px;">Google Authorization Code Received</h2>
          <p style="color:#475569; font-size:13px; margin-bottom:20px;">Authorization code received. Backend token exchange and OAuth credential setup are required to complete IMAP/SMTP OAuth2 token storage.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_CODE', provider: 'google', code: ${JSON.stringify(code)} }, '*');
              window.setTimeout(() => window.close(), 2000);
            }
          </script>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/auth/microsoft/url', async (req, res, next) => {
  try {
    const config = await loadMailConfig();
    const clientId = config?.microsoftClientId || process.env.MICROSOFT_CLIENT_ID || 'dummy_microsoft_client_id';
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/microsoft/callback`;
    const scopes = [
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Contacts.Read',
      'https://graph.microsoft.com/User.Read',
      'offline_access'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      response_mode: 'query'
    });
    res.json({ url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}` });
  } catch (error) { next(error); }
});

app.get('/api/auth/microsoft/callback', async (req, res) => {
  const { code } = req.query;
  res.send(`
    <html>
      <body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#f8fafc; color:#0f172a;">
        <div style="max-width:440px; margin:0 auto; background:white; padding:32px; border-radius:16px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="margin-bottom:12px; font-size:18px;">Microsoft Authorization Code Received</h2>
          <p style="color:#475569; font-size:13px; margin-bottom:20px;">Authorization code received. Backend token exchange and OAuth credential setup are required to complete Outlook OAuth2 token storage.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_CODE', provider: 'microsoft', code: ${JSON.stringify(code)} }, '*');
              window.setTimeout(() => window.close(), 2000);
            }
          </script>
        </div>
      </body>
    </html>
  `);
});

app.use('/api', (req: any, _res: any, next: any) => {
  if (!APP_TOKEN) return next();
  const supplied = req.get('x-app-token') || '';
  const valid = supplied.length === APP_TOKEN.length &&
    crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(APP_TOKEN));
  if (!valid) return next(new AppError(401, 'APP_TOKEN_REQUIRED', 'A valid app token is required.'));
  next();
});

async function requireConfig() {
  const config = await loadMailConfig();
  if (!config) throw new AppError(428, 'MAIL_NOT_CONFIGURED', 'Configure a mailbox in Settings first.');
  return config;
}

app.get('/api/settings', async (_req, res, next) => {
  try { res.json(publicMailConfig(await loadMailConfig())); } catch (error) { next(error); }
});

app.post('/api/settings/test', async (req, res, next) => {
  try {
    const existing = await loadMailConfig();
    const submitted = { ...existing, ...req.body };
    if (!req.body.password && existing?.password) submitted.password = existing.password;
    const settings = parse(settingsSchema, submitted);
    await verifySettings(settings);
    res.json({ ok: true, message: 'IMAP and SMTP connections succeeded.' });
  } catch (error) { next(error); }
});

app.put('/api/settings', async (req, res, next) => {
  try {
    const existing = await loadMailConfig();
    const submitted = { ...existing, ...req.body };
    if (!req.body.password && existing?.password) submitted.password = existing.password;
    const settings = parse(settingsSchema, submitted);
    await verifySettings(settings);
    await saveMailConfig(settings);
    res.json(publicMailConfig(settings));
  } catch (error) { next(error); }
});

app.get('/api/folders', async (_req, res, next) => {
  try { res.json({ folders: await listFolders(await requireConfig()) }); } catch (error) { next(error); }
});

app.get('/api/messages', async (req, res, next) => {
  try {
    const { folder, page, limit } = parse(folderQuerySchema, req.query);
    res.json(await listMessages(await requireConfig(), folder, page, limit));
  } catch (error) { next(error); }
});

app.get('/api/messages/:uid', async (req, res, next) => {
  try {
    const uid = Number(req.params.uid);
    if (!Number.isSafeInteger(uid) || uid < 1) throw new AppError(400, 'INVALID_UID', 'UID must be a positive integer.');
    const { folder } = parse(messageQuerySchema, req.query);
    res.json(await getMessage(await requireConfig(), folder, uid));
  } catch (error) { next(error); }
});

app.get('/api/messages/:uid/attachments/:index', async (req, res, next) => {
  try {
    const uid = Number(req.params.uid);
    const index = Number(req.params.index);
    if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(index) || index < 0) {
      throw new AppError(400, 'INVALID_PARAMS', 'Valid message UID and attachment index are required.');
    }
    const { folder } = parse(messageQuerySchema, req.query);
    const att = await getAttachment(await requireConfig(), folder, uid, index);
    res.setHeader('Content-Type', att.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.filename)}"`);
    res.send(att.content);
  } catch (error) { next(error); }
});

app.get('/api/messages/:folder/:uid/attachments/:id/download', async (req, res, next) => {
  try {
    const folder = decodeURIComponent(req.params.folder);
    const uid = Number(req.params.uid);
    const id = req.params.id;
    if (!Number.isSafeInteger(uid) || uid < 1) {
      throw new AppError(400, 'INVALID_PARAMS', 'Valid message UID is required.');
    }
    const index = id.startsWith('att-') ? parseInt(id.replace('att-', ''), 10) : Number(id);
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new AppError(400, 'INVALID_PARAMS', 'Valid attachment index or id is required.');
    }
    const att = await getAttachment(await requireConfig(), folder, uid, index);
    res.setHeader('Content-Type', att.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.filename)}"`);
    res.send(att.content);
  } catch (error) { next(error); }
});

app.patch('/api/messages/:uid/read', async (req, res, next) => {
  try {
    const uid = Number(req.params.uid);
    if (!Number.isSafeInteger(uid) || uid < 1) throw new AppError(400, 'INVALID_UID', 'UID must be a positive integer.');
    const { folder } = parse(messageQuerySchema, req.query);
    if (typeof req.body.read !== 'boolean') throw new AppError(400, 'INVALID_READ_STATE', 'read must be true or false.');
    res.json(await setReadState(await requireConfig(), folder, uid, req.body.read));
  } catch (error) { next(error); }
});

app.post('/api/messages/:uid/move', async (req, res, next) => {
  try {
    const uid = Number(req.params.uid);
    if (!Number.isSafeInteger(uid) || uid < 1) throw new AppError(400, 'INVALID_UID', 'UID must be a positive integer.');
    const { folder } = parse(messageQuerySchema, req.query);
    const destination = String(req.body.destination || '').trim();
    if (!destination || destination.length > 1000) throw new AppError(400, 'INVALID_FOLDER', 'A destination folder is required.');
    res.json(await moveMessage(await requireConfig(), folder, uid, destination));
  } catch (error) { next(error); }
});

app.post('/api/messages/bulk', async (req, res, next) => {
  try {
    const folder = String(req.body.folder || '');
    const action = String(req.body.action || '');
    const destination = req.body.destination ? String(req.body.destination) : undefined;
    const uids: number[] = Array.isArray(req.body.uids) ? (Array.from(new Set(req.body.uids.map((n: any) => Number(n)))) as number[]) : [];
    if (!folder || !uids.length || uids.length > 500 || uids.some((uid: any) => !Number.isSafeInteger(uid) || uid < 1)) {
      throw new AppError(400, 'BULK_MESSAGE_INPUT_INVALID', 'A folder and 1–500 valid message UIDs are required.');
    }
    if (!['read', 'unread', 'flag', 'unflag', 'move', 'delete'].includes(action)) throw new AppError(400, 'BULK_ACTION_INVALID', 'Unsupported bulk action.');
    if (action === 'move' && !destination) throw new AppError(400, 'BULK_DESTINATION_REQUIRED', 'A destination folder is required.');
    res.json(await bulkMessageAction(await requireConfig(), folder, uids, action, destination));
  } catch (error) { next(error); }
});

app.post('/api/send', async (req, res, next) => {
  try {
    const message = parse(sendSchema, req.body);
    res.status(201).json({ ok: true, ...(await sendMessage(await requireConfig(), message)) });
  } catch (error) { next(error); }
});

app.get('/api/local/messages', (req, res, next) => {
  try {
    const folder = String(req.query.folder || '').toLowerCase();
    if (!['sent', 'drafts'].includes(folder)) throw new AppError(400, 'LOCAL_FOLDER_INVALID', 'Local folder must be sent or drafts.');
    res.json({ messages: localStore.listMessages(folder) });
  } catch (error) { next(error); }
});

app.get('/api/local/messages/:id', (req, res, next) => {
  try {
    const message = localStore.getMessage(req.params.id);
    if (!message) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Local message not found.');
    res.json(message);
  } catch (error) { next(error); }
});

app.post('/api/local/outgoing', (req, res, next) => {
  try {
    const request = parse(outgoingSchema, req.body);
    if (request.provider === 'rackspace-webmail') {
      const { originalFolder, originalUid, compose } = request.message.providerContext;
      if (!compose) throw new AppError(400, 'RACKSPACE_COMPOSE_CONTEXT_REQUIRED', 'Captured Rackspace compose context is required.');
      if (request.operation !== 'new' && (!originalFolder || !originalUid)) throw new AppError(400, 'RACKSPACE_ORIGINAL_MESSAGE_REQUIRED', 'The original Rackspace folder and UID are required.');
      if (request.message.attachments.length) throw new AppError(400, 'RACKSPACE_ATTACHMENT_NOT_UPLOADED', 'Rackspace attachments must be uploaded before the message is queued.');
    }
    const message = localStore.createOutgoing(request);
    res.status(202).json({ accepted: true, id: message.id, status: message.status, message });
  } catch (error) { next(error); }
});

app.post('/api/local/messages/:id/retry', (req, res, next) => {
  try { res.status(202).json(localStore.retryMessage(req.params.id)); } catch (error) { next(error); }
});

app.post('/api/local/drafts', (req, res, next) => {
  try {
    const request = parse(draftSchema, req.body);
    res.status(201).json(localStore.createDraft({ ...request.message, operation: request.operation }));
  } catch (error) { next(error); }
});

app.put('/api/local/drafts/:id', (req, res, next) => {
  try {
    const request = parse(draftSchema, req.body);
    res.json(localStore.updateDraft(req.params.id, { ...request.message, operation: request.operation }));
  } catch (error) { next(error); }
});

app.delete('/api/local/drafts/:id', (req, res, next) => {
  try { localStore.deleteDraft(req.params.id); res.status(204).end(); } catch (error) { next(error); }
});

app.get('/api/rackspace/uid-mappings/resolve', (req, res, next) => {
  try {
    const imapFolder = String(req.query.folder || '');
    const uidValidity = String(req.query.uidValidity || '');
    const imapUid = String(req.query.uid || '');
    if (!imapFolder || !uidValidity || !/^\d+$/.test(imapUid)) throw new AppError(400, 'UID_MAPPING_QUERY_INVALID', 'folder, uidValidity, and UID are required.');
    const mapping = localStore.resolveUidMapping({ imapFolder, uidValidity, imapUid });
    if (!mapping) throw new AppError(409, 'RACKSPACE_UID_NOT_VERIFIED', 'This IMAP message has no verified Rackspace UID mapping.');
    res.json({ rackspaceFolder: mapping.rackspace_folder, rackspaceUid: mapping.rackspace_uid, evidence: mapping.evidence, verifiedAt: mapping.verified_at });
  } catch (error) { next(error); }
});

app.get('/api/rackspace/status', async (_req, res, next) => {
  try { res.json({ ...(await rackspaceSessionStatus()), sessionExtension: rackspaceSessionExtension.status() }); } catch (error) { next(error); }
});

app.post('/api/rackspace/compose/get-resend-message', async (req, res, next) => {
  try {
    const request = parse(rackspaceResendSchema, req.body);
    const compose = await getResendMessage(request);
    res.json({ compose, originalFolder: request.folder, originalUid: String(request.uid) });
  } catch (error) { next(error); }
});

app.post('/api/rackspace/compose/load', async (req, res, next) => {
  try {
    const request = parse(rackspaceComposeLoadSchema, req.body);
    const compose = await getComposeMessage(request);
    res.json({ compose, originalFolder: request.folder, originalUid: request.uid === null ? null : String(request.uid) });
  } catch (error) { next(error); }
});

app.post('/api/rackspace/compose/save-draft', async (req, res, next) => {
  try { const request = parse(rackspaceComposeMutationSchema, req.body); res.json(await saveDraftWithExpandedAddresses(request)); } catch (error) { next(error); }
});

app.post('/api/rackspace/compose/send', async (req, res, next) => {
  try { const request = parse(rackspaceComposeMutationSchema, req.body); const result = await sendComposeOperation(request); res.status(result.confirmedSuccess ? 200 : 202).json(result); } catch (error) { next(error); }
});

app.delete('/api/rackspace/compose/drafts/:uid', async (req, res, next) => {
  try { if (!/^\d+$/.test(req.params.uid)) throw new AppError(400, 'INVALID_UID', 'UID must be numeric.'); await deleteRackspaceDraft(req.params.uid, String(req.query.autosaveId || '')); res.status(204).end(); } catch (error) { next(error); }
});

app.post('/api/rackspace/compose/change-body-type', async (req, res, next) => {
  try { res.json(await changeComposeBodyType(parse(rackspaceChangeBodyTypeSchema, req.body))); } catch (error) { next(error); }
});

app.post('/api/rackspace/compose/attachments', async (req, res, next) => {
  try {
    const file = parse(localAttachmentSchema, req.body);
    const uploaded = await uploadRackspaceAttachment(file);
    res.status(201).json({ id: file.id || crypto.randomUUID(), ...uploaded });
  } catch (error) { next(error); }
});

app.get('/api/rackspace/folders', async (_req, res, next) => {
  try { res.json({ folders: await getRackspaceFolderStatuses() }); } catch (error) { next(error); }
});

app.get('/api/rackspace/messages', async (req, res, next) => {
  try { const { folder, limit } = parse(folderQuerySchema, req.query); res.json(await getRackspaceMessages(folder, [], 0, limit)); } catch (error) { next(error); }
});

app.get('/api/rackspace/messages/:uid', async (req, res, next) => {
  try { if (!/^\d+$/.test(req.params.uid)) throw new AppError(400, 'INVALID_UID', 'UID must be numeric.'); const { folder } = parse(messageQuerySchema, req.query); res.json(await getRackspaceMessage(folder, req.params.uid, req.query.blockImages !== 'false')); } catch (error) { next(error); }
});

app.post('/api/rackspace/mail/read-status', async (req, res, next) => {
  try { const messages = validateRackspaceMessageRefs(req.body.messages); if (typeof req.body.read !== 'boolean') throw new AppError(400, 'INVALID_READ_STATE', 'read must be boolean.'); res.json({ ok: await setRackspaceReadStatus(messages, req.body.read) }); } catch (error) { next(error); }
});

app.post('/api/rackspace/mail/move', async (req, res, next) => {
  try { const messages = validateRackspaceMessageRefs(req.body.messages); const destination = String(req.body.destination || ''); if (!destination) throw new AppError(400, 'INVALID_FOLDER', 'Destination is required.'); res.json({ ok: await moveRackspaceMessages(messages, destination) }); } catch (error) { next(error); }
});

app.post('/api/rackspace/mail/delete', async (req, res, next) => {
  try { const messages = validateRackspaceMessageRefs(req.body.messages); res.json({ ok: await deleteRackspaceMessages(messages, Boolean(req.body.permanent)) }); } catch (error) { next(error); }
});

app.post('/api/rackspace/mail/flag', async (req, res, next) => {
  try { const messages = validateRackspaceMessageRefs(req.body.messages); if (typeof req.body.flagged !== 'boolean') throw new AppError(400, 'INVALID_FLAG_STATE', 'flagged must be boolean.'); res.json({ ok: await setRackspaceFlag(messages, req.body.flagged, false) }); } catch (error) { next(error); }
});

app.post('/api/rackspace/compose/send-resend', async (req, res, next) => {
  try {
    const request = parse(rackspaceSendResendSchema, req.body);
    const result = await sendResend(request);
    res.status(result.confirmedSuccess ? 200 : 202).json(result);
  } catch (error) { next(error); }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_PATH));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(DIST_PATH, 'index.html'));
    });
  }

  app.use((error: any, _req: any, res: any, _next: any) => {
    const safe = error.status ? error : publicError(error);
    if ((safe.status || 500) >= 500) console.error(error);
    res.status(safe.status || 500).json({
      error: { code: safe.code || 'SERVER_ERROR', message: safe.message, ...(safe.details ? { details: safe.details } : {}) }
    });
  });

  if (process.env.NODE_ENV !== 'test') {
    const worker = new DeliveryWorker({ store: localStore });
    app.listen(PORT, HOST, () => {
      worker.start();
      console.log(`Customwebmail backend listening on http://${HOST}:${PORT}`);
      void rackspaceSessionStatus().then(status => {
        if (status.configured) rackspaceSessionExtension.start();
      }).catch(error => console.warn(`Rackspace session extension not started: ${error.code || 'RACKSPACE_SESSION_STATUS_FAILED'}`));
    });
  }
}

startServer();

function validateRackspaceMessageRefs(input) {
  if (!Array.isArray(input) || !input.length || input.length > 500) throw new AppError(400, 'RACKSPACE_MESSAGE_REFS_INVALID', 'One to 500 message references are required.');
  return input.map(item => { const folder = String(item?.folder || ''); const uid = String(item?.uid || ''); if (!folder || !/^\d+$/.test(uid)) throw new AppError(400, 'RACKSPACE_MESSAGE_REF_INVALID', 'Each message requires a folder and numeric UID.'); return { folder, uid, ...(typeof item.unread === 'boolean' ? { unread: item.unread } : {}) }; });
}
