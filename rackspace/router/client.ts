import { AppError } from '../../backend/errors.js';
import { getRackspaceSession } from '../session-context.js';

const DEBUG = process.env.RACKSPACE_DEBUG === 'true';

function payloadShape(value: any, key = ''): any {
  if (/wsid|cookie|token|password|authorization/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.length ? [payloadShape(value[0])] : [];
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, payloadShape(childValue, childKey)]));
  }
  return `<${value === null ? 'null' : typeof value}>`;
}

function debugRequest(operation: string, payload: any, routerBaseUrl: string) {
  if (!DEBUG) return;
  const path = new URL(routerBaseUrl).pathname.replace(/\/$/, '');
  console.info(`REQUEST: POST ${path}/${operation}`);
  console.info('SANITIZED PAYLOAD STRUCTURE:', JSON.stringify(payloadShape(payload)));
}

function containsLoggedOut(value: any) {
  return /logged out|session (has )?expired|not authenticated/i.test(JSON.stringify(value));
}

export async function callRackspaceRouter(operation: string, args: any[]) {
  if (!/^[A-Za-z]+\.[A-Za-z]+$/.test(operation)) {
    throw new AppError(500, 'RACKSPACE_OPERATION_INVALID', 'The Rackspace router operation is invalid.');
  }
  const session = await getRackspaceSession();
  const payload = buildRouterPayload(operation, args, session.wsid);
  debugRequest(operation, payload, session.routerBaseUrl);

  const response = await fetch(`${session.routerBaseUrl}/${operation}`, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: '*/*',
      'content-type': 'application/x-www-form-urlencoded',
      cookie: session.cookie,
      origin: session.origin,
      referer: `${session.origin}/`,
      'x-requested-with': 'XMLHttpRequest'
    },
    body: buildRouterFormBody(payload)
  });

  if (response.status >= 300 && response.status < 400) {
    throw new AppError(401, 'RACKSPACE_SESSION_EXPIRED', 'Rackspace redirected the router request; the authenticated session may have expired.');
  }

  const responseText = await response.text();
  const result = parseRouterResponse(responseText);
  if (response.status === 401 || response.status === 403 || containsLoggedOut(result)) {
    throw new AppError(401, 'RACKSPACE_SESSION_EXPIRED', 'The authenticated Rackspace Webmail session has expired.');
  }
  if (!response.ok) {
    throw new AppError(502, 'RACKSPACE_ROUTER_ERROR', `Rackspace router returned HTTP ${response.status}.`);
  }
  return result;
}

export function buildRouterFormBody(payload: any) {
  return new URLSearchParams({
    type: payload.type,
    roe: String(payload.roe),
    jobs: JSON.stringify(payload.jobs),
    wsid: payload.wsid
  }).toString();
}

export function parseRouterResponse(text: string) {
  const source = String(text || '').trim().replace(/;\s*"[^"]*";\s*$/, '');
  try { return JSON.parse(source); } catch {
    throw new AppError(502, 'RACKSPACE_RESPONSE_INVALID', 'Rackspace returned an unrecognized router response envelope.');
  }
}

export function buildRouterPayload(operation: string, args: any[], wsid: string) {
  return {
    type: 'batch',
    roe: false,
    jobs: [{ call: operation, args }],
    wsid
  };
}
