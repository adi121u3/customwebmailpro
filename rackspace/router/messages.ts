import { AppError } from '../../backend/errors.js';
import { callRackspaceRouter } from './client.js';

export async function getRackspaceMessages(folder: string, knownUids: any[] = [], start = 0, limit = 100) {
  const response = await callRackspaceRouter('MessageList.getMessages', buildMessageListArgs(folder, knownUids, start, limit));
  const result: any = response?.[0];
  if (!result || !Array.isArray(result.headers) || !Number.isInteger(result.total) || !Number.isInteger(result.unread)) {
    throw new AppError(502, 'RACKSPACE_MESSAGE_LIST_RESPONSE_UNKNOWN', 'Rackspace returned an unrecognized message-list response.');
  }
  return result;
}

export async function getRackspaceFolderStatuses() {
  const response = await callRackspaceRouter('FolderList.getFolderStatuses', []);
  if (!Array.isArray(response) || !Array.isArray(response[0])) throw new AppError(502, 'RACKSPACE_FOLDER_STATUS_RESPONSE_UNKNOWN', 'Rackspace returned an unrecognized folder-status response.');
  return response[0];
}

export async function getRackspaceMessage(folder: string, uid: string, blockImages = true) {
  const response = await callRackspaceRouter('MessageView.getMessage', buildMessageViewArgs(folder, uid, blockImages));
  if (!Array.isArray(response) || !response[0] || typeof response[0] !== 'object') throw new AppError(502, 'RACKSPACE_MESSAGE_RESPONSE_UNKNOWN', 'Rackspace returned an unrecognized message response.');
  return response[0];
}

export function buildMessageListArgs(folder: string, knownUids: any[] = [], start = 0, limit = 100) { return [folder, knownUids.map(String), start, limit, 0, null]; }
export function buildMessageViewArgs(folder: string, uid: string, blockImages = true) { return [folder, String(uid), 0, { force_plain: false, get_siblings: false, prefetch: false, block_images: blockImages ? 1 : 0 }]; }
