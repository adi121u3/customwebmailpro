import { AppError } from '../../backend/errors.js';
import { callRackspaceRouter } from './client.js';

export function parseExtendSessionResponse(response: any) {
  if (!Array.isArray(response) || response.length !== 1 || !response[0] || typeof response[0] !== 'object') {
    throw new AppError(502, 'RACKSPACE_EXTEND_SESSION_RESPONSE_UNKNOWN', 'Rackspace returned an unrecognized extendSession response.');
  }
  const interval = (response[0] as any).interval;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new AppError(502, 'RACKSPACE_EXTEND_SESSION_INTERVAL_UNKNOWN', 'Rackspace extendSession did not return a positive integer interval.');
  }
  return { response, interval };
}

export async function extendSession(routerCall = callRackspaceRouter) {
  const response = await routerCall('Webmail.extendSession', []);
  return parseExtendSessionResponse(response);
}
