import fs from 'fs/promises';
import { AppError } from '../backend/errors.js';

async function readSecret(fileName?: string, environmentValue?: string) {
  if (fileName) return (await fs.readFile(fileName, 'utf8')).trim();
  return (environmentValue || '').trim();
}

/**
 * Loads an already-authenticated Rackspace Webmail session on the server.
 * Secrets can be supplied by protected files (preferred) or environment
 * variables. They are never returned to the frontend.
 *
 * This module intentionally does not guess or automate Rackspace's login flow.
 */
export async function getRackspaceSession() {
  const [wsid, cookie] = await Promise.all([
    readSecret(process.env.RACKSPACE_WSID_FILE, process.env.RACKSPACE_WSID),
    readSecret(process.env.RACKSPACE_COOKIE_FILE, process.env.RACKSPACE_COOKIE_HEADER)
  ]);
  const routerBaseUrl = (process.env.RACKSPACE_ROUTER_BASE_URL || '').trim().replace(/\/$/, '');

  if (!routerBaseUrl || !wsid || !cookie) {
    throw new AppError(
      428,
      'RACKSPACE_SESSION_NOT_CONFIGURED',
      'The backend does not have an authenticated Rackspace Webmail router session.'
    );
  }

  let parsedUrl;
  try { parsedUrl = new URL(routerBaseUrl); } catch {
    throw new AppError(500, 'RACKSPACE_ROUTER_URL_INVALID', 'The Rackspace router base URL is invalid.');
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new AppError(500, 'RACKSPACE_ROUTER_URL_INSECURE', 'The Rackspace router URL must use HTTPS.');
  }

  const allowedHosts = (process.env.RACKSPACE_ALLOWED_HOSTS || 'webmail.emailsrvr.com')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
    throw new AppError(500, 'RACKSPACE_ROUTER_HOST_NOT_ALLOWED', 'The Rackspace router host is not in RACKSPACE_ALLOWED_HOSTS.');
  }
  if (/\r|\n/.test(cookie) || /\r|\n/.test(wsid)) {
    throw new AppError(500, 'RACKSPACE_SESSION_INVALID', 'Rackspace session values contain invalid characters.');
  }

  return { wsid, cookie, routerBaseUrl, origin: parsedUrl.origin };
}

export async function rackspaceSessionStatus() {
  try {
    const session = await getRackspaceSession();
    return {
      configured: true,
      routerBaseUrl: session.routerBaseUrl,
      sentFolder: process.env.RACKSPACE_SENT_FOLDER || null,
      source: process.env.RACKSPACE_WSID_FILE ? 'protected-files' : 'environment'
    };
  } catch (error: any) {
    if (error.code === 'RACKSPACE_SESSION_NOT_CONFIGURED') return { configured: false };
    throw error;
  }
}
