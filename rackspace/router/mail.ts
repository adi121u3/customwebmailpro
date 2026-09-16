import { AppError } from '../../backend/errors.js';
import { callRackspaceRouter } from './client.js';

function confirmedBoolean(response: any, operation: string) {
  if (!Array.isArray(response) || response[0] !== true) throw new AppError(502, 'RACKSPACE_MAIL_RESPONSE_UNKNOWN', `Rackspace did not confirm ${operation}.`);
  return true;
}

export async function setRackspaceReadStatus(messages: any[], read: boolean) {
  return confirmedBoolean(await callRackspaceRouter('Mail.setReadStatus', buildSetReadStatusArgs(messages, read)), 'read status');
}

export async function moveRackspaceMessages(messages: any[], destination: string) {
  return confirmedBoolean(await callRackspaceRouter('Mail.moveMessages', buildMoveMessagesArgs(messages, destination)), 'message move');
}

export async function deleteRackspaceMessages(messages: any[], permanent = false) {
  return confirmedBoolean(await callRackspaceRouter('Mail.deleteMessages', buildDeleteMessagesArgs(messages, permanent)), 'message deletion');
}

export async function setRackspaceFlag(messages: any[], flagged: boolean, unknownThirdArgument = false) {
  return confirmedBoolean(await callRackspaceRouter('Mail.setFlag', buildSetFlagArgs(messages, flagged, unknownThirdArgument)), 'flag status');
}

export function buildSetReadStatusArgs(messages: any[], read: boolean) { return [messages, read]; }
export function buildMoveMessagesArgs(messages: any[], destination: string) { return [messages, destination]; }
export function buildDeleteMessagesArgs(messages: any[], permanent = false) { return [messages, permanent]; }
export function buildSetFlagArgs(messages: any[], flagged: boolean, unknownThirdArgument = false) { return [messages, flagged, unknownThirdArgument]; }
