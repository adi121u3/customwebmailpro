import React from 'react';
import { Inbox, Paperclip, Star } from 'lucide-react';
import { Message } from '../types';

interface MessageListProps {
  messages: Message[];
  activeFolder: string;
  onMessageClick: (message: Message) => void;
  selectedMessage: Message | null;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onFlag: (message: Message) => void;
  loading: boolean;
  error: string;
  density?: 'micro' | 'compact' | 'standard' | 'large';
}

export default function MessageList({
  messages,
  activeFolder,
  onMessageClick,
  selectedMessage,
  selectedIds,
  onToggle,
  onToggleAll,
  onFlag,
  loading,
  error,
  density = 'standard'
}: MessageListProps) {
  const allChecked = messages.length > 0 && messages.every(m => selectedIds.has(m.id));

  return (
    <div className="flex-1 flex flex-col bg-white border-r border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Folder</span>
          <h2 className="text-lg font-bold text-slate-900">{friendlyFolder(activeFolder)}</h2>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-200/70 text-slate-700">
          {messages.length} messages
        </span>
      </div>

      <div className="grid grid-cols-[40px_40px_1fr_2fr_100px_90px] items-center px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
        <div className="flex items-center justify-center">
          <input
            aria-label="Select all messages"
            type="checkbox"
            checked={allChecked}
            onChange={onToggleAll}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
          />
        </div>
        <div />
        <span>Sender</span>
        <span>Subject</span>
        <span>Date</span>
        <span>Status</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center space-y-3 text-slate-400">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Syncing mailbox messages…</p>
          </div>
        ) : error ? (
          <div className="m-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center space-y-3 text-slate-400">
            <Inbox size={40} strokeWidth={1.5} />
            <p className="text-sm font-medium">This folder is empty</p>
          </div>
        ) : (
          messages.map(message => {
            const isSelected = selectedMessage?.id === message.id;
            const isChecked = selectedIds.has(message.id);
            const isUnread = !message.read;
            const sender = senderFor(message);
            const initial = sender.replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase() || '?';

            return (
              <div
                key={message.id}
                onClick={() => onMessageClick(message)}
                className={`grid grid-cols-[40px_40px_1fr_2fr_100px_90px] items-center px-4 transition-colors cursor-pointer group ${
                  density === 'micro' ? 'py-1.5' : density === 'compact' ? 'py-2.5' : density === 'large' ? 'py-5' : 'py-3.5'
                } ${isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : isUnread ? 'bg-slate-50/80 font-semibold' : 'bg-white hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                  <input
                    aria-label={`Select ${message.subject || 'message'}`}
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(message.id)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => onFlag(message)}
                    className="p-1 rounded-lg text-slate-400 hover:text-amber-500 transition-colors"
                  >
                    <Star
                      size={16}
                      className={message.flagged ? 'text-amber-500 fill-amber-500' : 'hover:scale-110 transition-transform'}
                    />
                  </button>
                </div>

                <div className="flex items-center space-x-3 pr-4 truncate">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0 ${
                    isUnread ? 'bg-blue-600' : 'bg-slate-500'
                  }`}>
                    {initial}
                  </div>
                  <span className={`truncate text-sm ${isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                    {sender}
                  </span>
                </div>

                <div className="flex items-center space-x-2 pr-4 truncate">
                  <span className={`truncate text-sm ${isUnread ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                    {message.subject || '(No subject)'}
                  </span>
                  {message.attachments && message.attachments.length > 0 && (
                    <Paperclip size={14} className="text-slate-400 shrink-0" />
                  )}
                </div>

                <div className="text-xs text-slate-500 whitespace-nowrap">
                  {formatDate(message.date || message.receivedDate)}
                </div>

                <div>
                  {message.status ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      message.status === 'delivered' || message.status === 'sent'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {message.status}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">
                      {formatSize(message.size)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function friendlyFolder(path: string) {
  return path.split(/[./]/).pop() || path;
}

function addressText(items: any = []) {
  if (typeof items === 'string') return items;
  if (!Array.isArray(items)) return '';
  return items.map(item => (typeof item === 'string' ? item : item.name || item.address)).join(', ');
}

function senderFor(message: Message) {
  if (typeof message.from === 'string') return message.fromName || message.from;
  return addressText(message.from) || addressText(message.to) || 'Unknown sender';
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatSize(bytes?: number) {
  if (!bytes) return '—';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
