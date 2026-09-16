import api from '../api';

export async function uploadRackspaceComposeAttachment(payload: {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentBase64: string;
}) {
  const res = await api.post('/rackspace/compose/attachments', payload);
  return res.data;
}
