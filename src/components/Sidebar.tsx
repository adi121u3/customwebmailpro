import React from 'react';
import { Archive, FileText, Folder as FolderIcon, Inbox, MailWarning, PenLine, Send, ShieldAlert, Trash2 } from 'lucide-react';
import { Folder } from '../types';

interface SidebarProps {
  folders: Folder[];
  activeFolder: string;
  onFolderChange: (path: string) => void;
  onCompose: () => void;
}

const icons: Record<string, React.ElementType> = {
  '\\Inbox': Inbox,
  '\\Sent': Send,
  '\\Drafts': FileText,
  '\\Junk': ShieldAlert,
  '\\Trash': Trash2,
  '\\Archive': Archive
};

export default function Sidebar({ folders, activeFolder, onFolderChange, onCompose }: SidebarProps) {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-[calc(100vh-4rem)] select-none">
      <div className="p-4 border-b border-slate-800/80">
        <button
          onClick={onCompose}
          className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/35 transition-all transform active:scale-95"
        >
          <PenLine size={17} />
          <span>Compose</span>
        </button>
      </div>

      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800/60">
        <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Mailboxes</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
          {folders.length}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {folders.map(folder => {
          const Icon = icons[folder.specialUse || ''] || (/spam|junk/i.test(folder.name) ? MailWarning : FolderIcon);
          const isActive = activeFolder === folder.path;
          const displayCount = (folder.unreadCount ?? 0) > 0 ? folder.unreadCount : ((folder.messageCount ?? 0) > 0 ? folder.messageCount : 0);
          return (
            <button
              key={folder.path}
              onClick={() => onFolderChange(folder.path)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3 truncate">
                <Icon size={18} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
                <span className="truncate">{folder.name}</span>
              </div>
              {displayCount > 0 ? (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold shrink-0 ml-2 ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}>
                  {displayCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 flex items-center space-x-2.5 text-xs text-slate-400">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" />
        <span className="font-medium text-slate-300">Backend Synced</span>
      </div>
    </aside>
  );
}
