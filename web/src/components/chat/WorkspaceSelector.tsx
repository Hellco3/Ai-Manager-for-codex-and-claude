import React, { useState, useCallback } from 'react';
import { t } from '../../i18n.js';

interface WorkspaceSelectorProps {
  workspaceDir: string | null;
  onUpdate: (dir: string) => void;
  disabled?: boolean;
}

export default function WorkspaceSelector({ workspaceDir, onUpdate, disabled }: WorkspaceSelectorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(workspaceDir ?? '');
  const [valid, setValid] = useState<boolean | null>(null);

  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/sessions/workspace-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceDir: trimmed }),
      });
      if (res.ok) {
        setValid(true);
        onUpdate(trimmed);
        setEditing(false);
      } else {
        setValid(false);
      }
    } catch {
      setValid(false);
    }
  }, [value, onUpdate]);

  const handleBrowse = async () => {
    try {
      // Use File System Access API if available
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        const dirPath = dirHandle.name; // Only gets directory name, not full path in browsers
        setValue(dirPath);
        onUpdate(dirPath);
        setEditing(false);
        setValid(true);
      }
    } catch {
      // User cancelled
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border-b border-slate-700/50 shrink-0">
      <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>

      {editing ? (
        <div className="flex items-center gap-1 flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setValid(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            placeholder={t.workspace.placeholder}
            className="flex-1 bg-slate-900/80 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            autoFocus
            disabled={disabled}
          />
          <button onClick={handleSave} className="px-2 py-1 rounded text-[10px] bg-blue-600 text-white hover:bg-blue-500" disabled={disabled}>
            {t.workspace.save}
          </button>
          <button onClick={() => { setEditing(false); setValue(workspaceDir ?? ''); setValid(null); }} className="px-2 py-1 rounded text-[10px] bg-slate-700 text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-slate-400 truncate flex-1" title={workspaceDir ?? ''}>
            {workspaceDir ?? t.workspace.default}
          </span>
          <button onClick={() => { handleBrowse(); }} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400 hover:text-slate-200" title={t.workspace.browse} disabled={disabled}>
            📁
          </button>
          <button onClick={() => { setEditing(true); setValue(workspaceDir ?? ''); }} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400 hover:text-slate-200" title={t.workspace.edit} disabled={disabled}>
            ✏️
          </button>
        </div>
      )}

      {valid === true && <span className="text-green-400 text-xs shrink-0">✓</span>}
      {valid === false && <span className="text-red-400 text-xs shrink-0">✗ {t.workspace.invalid}</span>}
    </div>
  );
}
