import React, { useState } from 'react';
import { Archive, CheckCheck, ChevronDown, Filter, Forward, Mail, MailOpen, MoreHorizontal, RefreshCw, Reply, ReplyAll, RotateCcw, ShieldAlert, Star, StarOff, Trash2 } from 'lucide-react';

interface MailToolbarProps {
  onCheck: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onResend: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onSpam: () => void;
  onRead: () => void;
  onUnread: () => void;
  onFlag: () => void;
  onUnflag: () => void;
  onClearSelection: () => void;
  canUseMessage: boolean;
  canResend: boolean;
  selectedCount: number;
  busy: boolean;
  filter: 'all' | 'unread' | 'flagged' | 'attachments';
  onFilterChange: (filter: 'all' | 'unread' | 'flagged' | 'attachments') => void;
  isTrash: boolean;
  onEmptyTrash: () => void;
}

export default function MailToolbar({
  onCheck,
  onReply,
  onReplyAll,
  onForward,
  onResend,
  onDelete,
  onArchive,
  onSpam,
  onRead,
  onUnread,
  onFlag,
  onUnflag,
  onClearSelection,
  canUseMessage,
  canResend,
  selectedCount,
  busy,
  filter,
  onFilterChange,
  isTrash,
  onEmptyTrash
}: MailToolbarProps) {
  const [more, setMore] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const filterLabels: Record<string, string> = {
    all: 'All Messages',
    unread: 'Unread',
    flagged: 'Flagged',
    attachments: 'Has Attachments'
  };

  return (
    <div className="h-14 bg-white border-b border-slate-200 px-5 flex items-center justify-between shadow-xs">
      <div className="flex items-center space-x-1.5">
        <ToolbarButton icon={RefreshCw} label="Refresh" onClick={onCheck} disabled={busy} spin={busy} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolbarButton icon={Reply} label="Reply" onClick={onReply} disabled={!canUseMessage} />
        <ToolbarButton icon={ReplyAll} label="Reply all" onClick={onReplyAll} disabled={!canUseMessage} />
        <ToolbarButton icon={Forward} label="Forward" onClick={onForward} disabled={!canUseMessage} />
        <ToolbarButton icon={RotateCcw} label="Re-send" onClick={onResend} disabled={!canResend} />

        <div className="w-px h-5 bg-slate-200 mx-1" />
        {/* Filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
          >
            <Filter size={14} className="text-slate-500" />
            <span>{filterLabels[filter]}</span>
            <ChevronDown size={12} />
          </button>
          {filterOpen && (
            <div className="absolute left-0 mt-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50">
              {(['all', 'unread', 'flagged', 'attachments'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { onFilterChange(f); setFilterOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${
                    filter === f ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {filterLabels[f]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {selectedCount > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {selectedCount} selected
          </span>
        )}
        {isTrash && (
          <button
            onClick={onEmptyTrash}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors"
            title="Permanently empty trash folder"
          >
            <Trash2 size={14} />
            <span>Empty Trash</span>
          </button>
        )}
        <ToolbarButton icon={Archive} label="Archive" onClick={onArchive} disabled={!selectedCount} />
        <ToolbarButton icon={ShieldAlert} label="Spam" onClick={onSpam} disabled={!selectedCount} />
        <ToolbarButton icon={Trash2} label="Delete" onClick={onDelete} disabled={!selectedCount} danger />
        
        <div className="relative">
          <button
            disabled={!selectedCount}
            onClick={() => setMore(v => !v)}
            className="flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all border border-slate-200"
          >
            <MoreHorizontal size={16} />
            <ChevronDown size={13} />
          </button>

          {more && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <MenuButton icon={MailOpen} label="Mark as read" onClick={() => { onRead(); setMore(false); }} />
              <MenuButton icon={Mail} label="Mark as unread" onClick={() => { onUnread(); setMore(false); }} />
              <MenuButton icon={Star} label="Add star" onClick={() => { onFlag(); setMore(false); }} />
              <MenuButton icon={StarOff} label="Remove star" onClick={() => { onUnflag(); setMore(false); }} />
              <div className="h-px bg-slate-100 my-1" />
              <MenuButton icon={CheckCheck} label="Clear selection" onClick={() => { onClearSelection(); setMore(false); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, spin, danger, ...props }: any) {
  return (
    <button
      title={label}
      {...props}
      className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        danger
          ? 'text-red-600 hover:bg-red-50 disabled:opacity-40'
          : 'text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent'
      }`}
    >
      <Icon size={17} className={spin ? 'animate-spin' : ''} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function MenuButton({ icon: Icon, label, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center space-x-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
    >
      <Icon size={16} className="text-slate-500" />
      <span>{label}</span>
    </button>
  );
}
