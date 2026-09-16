import { AppError } from '../../backend/errors.js';
import { callRackspaceRouter } from './client.js';

export async function getResendMessage({ folder, uid, thirdArgument }: any) {
  const response = await callRackspaceRouter('Compose.getResendMessage', [folder, String(uid), thirdArgument]);
  if (!Array.isArray(response) || !response[0] || typeof response[0] !== 'object') {
    throw new AppError(502, 'RACKSPACE_RESEND_RESPONSE_UNKNOWN', 'Rackspace returned an unrecognized getResendMessage response.');
  }
  return response[0];
}

const loadOperations: Record<string, string> = {
  new: 'Compose.getNewMessage',
  reply: 'Compose.getReplyMessage',
  reply_all: 'Compose.getReplyAllMessage',
  forward: 'Compose.getForwardMessage',
  resend: 'Compose.getResendMessage',
  restore_draft: 'Compose.getResumeDraftMessage'
};

export async function getComposeMessage({ action, folder = null, uid = null, thirdArgument = false }: any) {
  const operation = loadOperations[action];
  if (!operation) throw new AppError(400, 'RACKSPACE_COMPOSE_ACTION_INVALID', 'Unsupported captured Rackspace compose action.');
  const args = buildComposeLoadArgs({ action, folder, uid, thirdArgument });
  const response = await callRackspaceRouter(operation, args);
  if (!Array.isArray(response) || !response[0] || typeof response[0] !== 'object') {
    throw new AppError(502, 'RACKSPACE_COMPOSE_RESPONSE_UNKNOWN', `Rackspace returned an unrecognized ${operation} response.`);
  }
  return response[0];
}

export function buildComposeLoadArgs({ action, folder = null, uid = null, thirdArgument = false }: any) {
  return action === 'new' ? [null, null, thirdArgument] : [folder, String(uid), thirdArgument];
}

function priorityForSend(priority: any) {
  const capturedFormat = String(priority ?? '').match(/^([1-5])(?:\s|$)/);
  return capturedFormat ? capturedFormat[1] : String(priority ?? '');
}

function signatureForSend(signature: any) {
  return signature === false ? '' : signature;
}

function readReceiptForSend(readReceipt: any) {
  return readReceipt === null ? false : readReceipt;
}

function hasCapturedRecipientSuccess(response: any) {
  return Array.isArray(response) && Array.isArray(response[0]) && response[0].length > 0 &&
    response[0].every((recipient: any) => recipient && typeof recipient === 'object' && typeof recipient.email === 'string');
}

export async function sendResend({ compose, originalFolder, originalUid }: any) {
  const args = buildSendResendArgs({ compose, originalFolder, originalUid });
  const response = await callRackspaceRouter('Compose.send', args);

  return {
    response,
    confirmedSuccess: hasCapturedRecipientSuccess(response),
    confirmationRule: 'Captured success shape: a nested non-empty recipient array containing email strings.'
  };
}

export function buildComposeOperationArgs({ compose, originalFolder = null, originalUid = null, draftUid = null, autosaveId = '' }: any) {
  return [{
    message: {
      reply_msg_id: compose.reply_msg_id ?? false,
      compose_type: compose.compose_type,
      identity: String(compose.identity),
      to: compose.to || '',
      cc: compose.cc === false ? '' : (compose.cc || ''),
      bcc: compose.bcc === false ? '' : (compose.bcc || ''),
      subject: compose.subject || '',
      attachments: compose.attachments || [],
      body: compose.body || '',
      priority: priorityForSend(compose.priority || '3'),
      reply_references: compose.reply_references ?? false
    },
    action: compose.action,
    draft_uid: draftUid,
    autosave_id: autosaveId,
    ofolder: originalFolder,
    ouid: originalUid === null ? null : String(originalUid),
    read_receipt: readReceiptForSend(compose.read_receipt),
    signature: signatureForSend(compose.signature)
  }];
}

export async function sendComposeOperation(input: any) {
  const response = await callRackspaceRouter('Compose.send', buildComposeOperationArgs(input));
  return { response, confirmedSuccess: hasCapturedRecipientSuccess(response), confirmationRule: 'Captured nested recipient-array response.' };
}

export async function saveDraftWithExpandedAddresses(input: any) {
  const response = await callRackspaceRouter('Compose.saveDraftWithExpandedAddresses', buildComposeOperationArgs(input));
  if (!Array.isArray(response) || !response[0] || typeof response[0].folder !== 'string' || typeof response[0].uid !== 'string') {
    throw new AppError(502, 'RACKSPACE_DRAFT_SAVE_RESPONSE_UNKNOWN', 'Rackspace returned an unrecognized draft-save response.');
  }
  return response[0];
}

export async function deleteRackspaceDraft(uid: string, autosaveId = '') {
  const response = await callRackspaceRouter('Compose.deleteDraft', buildDeleteDraftArgs(uid, autosaveId));
  if (!Array.isArray(response) || response[0] !== true) throw new AppError(502, 'RACKSPACE_DRAFT_DELETE_RESPONSE_UNKNOWN', 'Rackspace did not confirm draft deletion.');
  return true;
}

export function buildDeleteDraftArgs(uid: string, autosaveId = '') { return [String(uid), autosaveId]; }

export function buildChangeBodyTypeArgs({ action, signature, type, body }: any) {
  return [{ action, signature, type, body }];
}

export async function changeComposeBodyType(input: any) {
  const response = await callRackspaceRouter('Compose.changeBodyType', buildChangeBodyTypeArgs(input));
  return parseChangeBodyTypeResponse(response);
}

export function parseChangeBodyTypeResponse(response: any) {
  const result = response?.[0];
  if (!result || result.type !== 'plain' || typeof result.body !== 'string') {
    throw new AppError(502, 'RACKSPACE_BODY_TYPE_RESPONSE_UNKNOWN', 'Rackspace returned an unrecognized HTML-to-plain conversion response.');
  }
  return result;
}

export function buildSendResendArgs({ compose, originalFolder, originalUid }: any) {
  const message = {
    reply_msg_id: false,
    compose_type: compose.compose_type,
    identity: String(compose.identity),
    to: compose.to,
    cc: compose.cc,
    bcc: compose.bcc,
    subject: compose.subject,
    attachments: compose.attachments,
    body: compose.body,
    priority: priorityForSend(compose.priority),
    reply_references: false
  };
  return [{
    message,
    action: 'resend',
    draft_uid: null,
    autosave_id: '',
    ofolder: originalFolder,
    ouid: String(originalUid),
    read_receipt: readReceiptForSend(compose.read_receipt),
    signature: signatureForSend(compose.signature)
  }];
}
