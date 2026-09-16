import React, { useEffect, useState } from 'react';
import { ChevronDown, Clock3, Download, Image as ImageIcon, Paperclip, RotateCcw, X } from 'lucide-react';
import { Message } from '../types';

interface MessagePreviewProps {
  message: Message;
  onResend: () => void;
  onRetry: () => void;
  canResend: boolean;
  onClose: () => void;
}

export default function MessagePreview({
  message,
  onResend,
  onRetry,
  canResend,
  onClose
}: MessagePreviewProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [frameHeight, setFrameHeight] = useState(430);
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);

  useEffect(() => {
    setShowDetails(false);
    setFrameHeight(430);
    setAllowRemoteImages(false);
  }, [message.id]);

  if (message.loading) {
    return (
      <aside className="w-[520px] bg-white border-l border-slate-200 flex flex-col items-center justify-center p-8 text-slate-400">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Loading message content…</p>
      </aside>
    );
  }

  const from = typeof message.from === 'string'
    ? `${message.fromName || ''} ${message.from}`.trim()
    : addresses(message.from) || 'Unknown sender';

  const initial = from.replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase() || '?';

  return (
    <aside className="w-[580px] bg-white border-l border-slate-200 flex flex-col h-[calc(100vh-7.5rem)] shadow-lg overflow-hidden animate-in slide-in-from-right duration-200">
      <header className="px-6 py-4 border-b border-slate-200 flex items-start justify-between bg-slate-50">
        <div className="pr-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Message View</span>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5 leading-snug">{message.subject || '(No subject)'}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          title="Close preview"
        >
          <X size={19} />
        </button>
      </header>

      <div className="p-6 border-b border-slate-100 bg-white space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-md shadow-blue-500/20">
              {initial}
            </div>
            <div>
              <strong className="block text-sm font-bold text-slate-900">{from}</strong>
              <button
                type="button"
                aria-expanded={showDetails}
                onClick={() => setShowDetails(v => !v)}
                className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-0.5"
              >
                <span>to {addresses(message.to) || 'me'}</span>
                <ChevronDown size={13} className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
          <time className="flex items-center space-x-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
            <Clock3 size={14} className="text-slate-400" />
            <span>{formatDate(message.date || message.receivedDate)}</span>
          </time>
        </div>

        {showDetails && (
          <dl className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex"><dt className="w-16 font-bold text-slate-500">From:</dt><dd className="flex-1 text-slate-800">{from}</dd></div>
            <div className="flex"><dt className="w-16 font-bold text-slate-500">To:</dt><dd className="flex-1 text-slate-800">{addresses(message.to) || 'me'}</dd></div>
            {addresses(message.cc) && <div className="flex"><dt className="w-16 font-bold text-slate-500">Cc:</dt><dd className="flex-1 text-slate-800">{addresses(message.cc)}</dd></div>}
            <div className="flex"><dt className="w-16 font-bold text-slate-500">Date:</dt><dd className="flex-1 text-slate-800">{formatDate(message.date || message.receivedDate)}</dd></div>
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {message.html && (
            <button
              type="button"
              onClick={() => setAllowRemoteImages(v => !v)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors border border-slate-200"
            >
              <ImageIcon size={15} className="text-slate-500" />
              <span>{allowRemoteImages ? 'Hide remote images' : 'Show remote images'}</span>
            </button>
          )}
          {canResend && (
            <button
              onClick={onResend}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors border border-blue-200"
            >
              <RotateCcw size={15} />
              <span>Re-send</span>
            </button>
          )}
          {message.status === 'failed' && (
            <button
              onClick={onRetry}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors border border-red-200"
            >
              <span>Retry delivery</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm min-h-full">
          {message.html ? (
            <iframe
              title="Email content"
              sandbox="allow-same-origin"
              style={{ height: frameHeight, width: '100%', border: 'none' }}
              onLoad={e => {
                try {
                  const height = e.currentTarget.contentDocument?.documentElement.scrollHeight || 430;
                  setFrameHeight(Math.min(Math.max(height + 16, 360), 2400));
                } catch {
                  setFrameHeight(430);
                }
              }}
              srcDoc={emailDocument(message.html, allowRemoteImages)}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 leading-relaxed">
              {message.text || message.body || 'No content available'}
            </pre>
          )}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
              <Paperclip size={15} />
              <span>{message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}</span>
            </h3>

            {/* Image gallery grid */}
            {message.attachments.some(att => att.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(att.filename || '')) && (
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Image Gallery</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {message.attachments
                    .filter(att => att.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(att.filename || ''))
                    .map((att, idx) => {
                      const downloadUrl = message.uid
                        ? `/api/messages/${message.uid}/attachments/${idx}?folder=${encodeURIComponent(message.folderPath || 'INBOX')}`
                        : (att.contentBase64 ? `data:${att.contentType || 'image/png'};base64,${att.contentBase64}` : '#');
                      const displaySrc = att.contentBase64 ? `data:${att.contentType || 'image/png'};base64,${att.contentBase64}` : '';
                      return (
                        <div key={att.id || idx} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex items-center justify-center shadow-xs">
                          {displaySrc ? (
                            <img src={displaySrc} alt={att.filename || 'Attachment'} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                            <ImageIcon size={24} className="text-slate-400" />
                          )}
                          <a
                            href={downloadUrl}
                            download={att.filename || 'image.png'}
                            className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity space-x-1.5 p-2 text-center"
                          >
                            <Download size={14} />
                            <span className="truncate">{att.filename || 'Download'}</span>
                          </a>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Other files list */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Other Files</span>
              <div className="space-y-2">
                {message.attachments
                  .filter(att => !(att.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(att.filename || '')))
                  .map((att, idx) => {
                    const downloadUrl = message.uid
                      ? `/api/messages/${message.uid}/attachments/${idx}?folder=${encodeURIComponent(message.folderPath || 'INBOX')}`
                      : (att.contentBase64 ? `data:${att.contentType || 'application/octet-stream'};base64,${att.contentBase64}` : '#');
                    return (
                      <div key={att.id || idx} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
                        <div className="flex items-center space-x-3 truncate">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <Paperclip size={17} />
                          </div>
                          <div className="truncate">
                            <strong className="block text-xs font-bold text-slate-900 truncate">{att.filename || 'Attachment'}</strong>
                            <small className="text-[11px] text-slate-500">{formatSize(att.size)}</small>
                          </div>
                        </div>
                        <a
                          href={downloadUrl}
                          download={att.filename || 'attachment'}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors border border-slate-200 shrink-0 ml-2"
                        >
                          <Download size={14} />
                          <span>Download</span>
                        </a>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {message.status && (
        <footer className="px-6 py-3 bg-slate-100 border-t border-slate-200 text-xs flex items-center justify-between text-slate-600">
          <span className="font-semibold capitalize">Delivery Status: {message.status}</span>
          {message.error && <span className="text-red-600 font-medium">{message.error}</span>}
        </footer>
      )}
    </aside>
  );
}

function addresses(items: any = []) {
  if (typeof items === 'string') return items;
  if (!Array.isArray(items)) return '';
  return items
    .map(item => (typeof item === 'string' ? item : item.name ? `${item.name} <${item.address}>` : item.address))
    .join(', ');
}

function formatDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function emailDocument(html: string, allowRemoteImages: boolean) {
  const imagePolicy = allowRemoteImages ? 'data: cid: https: http:' : 'data: cid:';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imagePolicy}; style-src 'unsafe-inline'"><style>html,body{margin:0!important;padding:0!important;width:100%!important;max-width:100%!important;overflow-x:hidden!important;background:#ffffff;color:#1e293b}body{padding:20px!important;box-sizing:border-box!important;overflow-wrap:anywhere!important;font-family:ui-sans-serif,system-ui,sans-serif!important;font-size:14px!important;line-height:1.6!important}table{max-width:100%!important}img{max-width:100%!important;height:auto!important}pre{white-space:pre-wrap!important}blockquote{margin-left:14px!important;padding-left:12px!important;border-left:3px solid #cbd5e1!important;color:#475569!important}</style></head><body>${html}</body></html>`;
}
