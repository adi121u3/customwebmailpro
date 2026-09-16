import fs from 'fs/promises';
import { AppError } from '../../backend/errors.js';
import { getRackspaceSession } from '../session-context.js';

async function readSecret(fileName?: string, environmentValue?: string) {
  if (fileName) return (await fs.readFile(fileName, 'utf8')).trim();
  return String(environmentValue || '').trim();
}

function allowedHosts() {
  return (process.env.RACKSPACE_ALLOWED_HOSTS || 'app.rackspace.com,apps.rackspace.com,webmail.emailsrvr.com')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

function validateUploadUrl(value: string) {
  let url;
  try { url = new URL(value); } catch {
    throw new AppError(500, 'RACKSPACE_UPLOAD_URL_INVALID', 'The Rackspace attachment upload URL is invalid.');
  }
  if (url.protocol !== 'https:' || !allowedHosts().includes(url.hostname.toLowerCase())) {
    throw new AppError(500, 'RACKSPACE_UPLOAD_URL_NOT_ALLOWED', 'The Rackspace attachment upload URL must use HTTPS and an allowed Rackspace host.');
  }
  if (url.searchParams.get('files') !== '1' || !/\/router\.php$/i.test(url.pathname)) {
    throw new AppError(500, 'RACKSPACE_UPLOAD_PATH_INVALID', 'The Rackspace attachment upload URL does not match the captured router.php?files=1 path.');
  }
  return url;
}

export function cookieValue(cookieHeader: string, name: string) {
  for (const item of String(cookieHeader || '').split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim();
  }
  return '';
}

export function buildAttachmentUploadForm({ uploadSessionId, uploadTokenFieldName, uploadSessionToken, filename, contentType, bytes }: any) {
  const form = new FormData();
  form.append('call', 'Compose.uploadAttachment');
  form.append('wsid', uploadSessionId);
  form.append(uploadTokenFieldName, uploadSessionToken);
  form.append('FILE_UPLOAD', new Blob([bytes], { type: contentType }), filename);
  return form;
}

export function parseAttachmentUploadResponse(text: string) {
  const source = String(text || '').trim();
  const match = source.match(/^\((\{[\s\S]*\})\);?$/);
  let result: any;
  try { result = JSON.parse(match ? match[1] : source); } catch {
    throw new AppError(502, 'RACKSPACE_ATTACHMENT_RESPONSE_INVALID', 'Rackspace returned an unrecognized attachment-upload response.');
  }
  if (!result || typeof result.name !== 'string' || !Number.isSafeInteger(result.size) || result.size < 0 || typeof result.type !== 'string' || typeof result.path !== 'string' || !result.path) {
    throw new AppError(502, 'RACKSPACE_ATTACHMENT_RESPONSE_UNKNOWN', 'Rackspace returned an unknown attachment object.');
  }
  return result;
}

export async function uploadRackspaceAttachment({ filename, contentType, contentBase64, size }: any) {
  const session = await getRackspaceSession();
  const [uploadUrlValue, uploadSessionId, uploadTokenFieldName] = await Promise.all([
    readSecret(process.env.RACKSPACE_UPLOAD_URL_FILE, process.env.RACKSPACE_UPLOAD_URL),
    readSecret(process.env.RACKSPACE_UPLOAD_SESSION_ID_FILE, process.env.RACKSPACE_UPLOAD_SESSION_ID),
    readSecret(process.env.RACKSPACE_UPLOAD_TOKEN_FIELD_NAME_FILE, process.env.RACKSPACE_UPLOAD_TOKEN_FIELD_NAME)
  ]);
  if (!uploadUrlValue || !uploadSessionId || !uploadTokenFieldName) throw new AppError(428, 'RACKSPACE_UPLOAD_NOT_CONFIGURED', 'The backend does not have the captured Rackspace upload URL, short upload session ID, and dynamic token-field name.');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uploadSessionId)) throw new AppError(500, 'RACKSPACE_UPLOAD_SESSION_INVALID', 'The Rackspace upload session ID has an invalid format.');
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(uploadTokenFieldName) || ['call', 'wsid', 'FILE_UPLOAD'].includes(uploadTokenFieldName)) {
    throw new AppError(500, 'RACKSPACE_UPLOAD_TOKEN_FIELD_INVALID', 'The Rackspace upload token-field name has an invalid format.');
  }
  const uploadUrl = validateUploadUrl(uploadUrlValue);
  const uploadSessionToken = cookieValue(session.cookie, uploadTokenFieldName);
  if (!uploadSessionToken) throw new AppError(401, 'RACKSPACE_UPLOAD_SESSION_EXPIRED', 'The Rackspace Cookie header does not contain the token named by the captured dynamic upload field.');
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.length !== size) throw new AppError(400, 'RACKSPACE_ATTACHMENT_SIZE_MISMATCH', 'Attachment size does not match its decoded content.');
  const response = await fetch(uploadUrl, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
    headers: {
      accept: '*/*',
      cookie: session.cookie,
      origin: uploadUrl.origin,
      referer: `${uploadUrl.origin}/a/webmail.php?wsid=${encodeURIComponent(uploadSessionId)}`
    },
    body: buildAttachmentUploadForm({ uploadSessionId, uploadTokenFieldName, uploadSessionToken, filename, contentType, bytes }) as any
  });
  if (response.status >= 300 && response.status < 400) throw new AppError(401, 'RACKSPACE_UPLOAD_SESSION_EXPIRED', 'Rackspace redirected the upload request; the authenticated session may have expired.');
  const responseText = await response.text();
  if (!response.ok) throw new AppError(502, 'RACKSPACE_ATTACHMENT_UPLOAD_FAILED', `Rackspace attachment upload returned HTTP ${response.status}.`);
  return parseAttachmentUploadResponse(responseText);
}
