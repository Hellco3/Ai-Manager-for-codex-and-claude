import React, { useState, useCallback, useEffect } from 'react';
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

  useEffect(() => {
    if (!editing) {
      setValue(workspaceDir ?? '');
    }
  }, [workspaceDir, editing]);

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
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        const dirPath = dirHandle.name;
        setValue(dirPath);
        onUpdate(dirPath);
        setEditing(false);
        setValid(true);
      }
    } catch {
      // 审计结论：取消目录选择不需要额外提示，保持当前 UI 状态即可。
    }
  };

  return (
    // 审计结论：WorkspaceSelector 已改为与 ChatFirst 新壳层一致的卡片式头部，不再沿用旧工具条样式。
    <div className="workspace-shell flex shrink-0 items-center gap-3 border-b px-3 py-3 md:px-5">
      <div className="accent-icon-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>

      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setValid(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setEditing(false);
                setValue(workspaceDir ?? '');
                setValid(null);
              }
            }}
            placeholder={t.workspace.placeholder}
            className="input-surface min-w-0 flex-1 rounded-2xl border px-3 py-2 text-sm outline-none transition-colors focus:border-purple-500/40"
            autoFocus
            disabled={disabled}
          />
          <button
            onClick={handleSave}
            className="rounded-2xl bg-purple-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-400 disabled:opacity-40"
            disabled={disabled}
            type="button"
          >
            {t.workspace.save}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setValue(workspaceDir ?? '');
              setValid(null);
            }}
            className="icon-button h-10 w-10"
            aria-label={t.progress.cancel}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Workspace</div>
            <span className="mt-1 block truncate text-sm text-slate-300" title={workspaceDir ?? ''}>
              {workspaceDir ?? t.workspace.default}
            </span>
          </div>
          <button onClick={handleBrowse} className="icon-button h-10 w-10" title={t.workspace.browse} disabled={disabled} type="button">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M3.75 7.5a1.75 1.75 0 011.75-1.75h4.086a1.75 1.75 0 011.237.513l1.164 1.164a1.75 1.75 0 001.237.513h5.526A1.75 1.75 0 0120.5 9.7v6.8a1.75 1.75 0 01-1.75 1.75H5.5a1.75 1.75 0 01-1.75-1.75V7.5z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M14.25 11.25h3m-1.5-1.5v3"
              />
            </svg>
          </button>
          <button
            onClick={() => {
              setEditing(true);
              setValue(workspaceDir ?? '');
            }}
            className="icon-button h-10 w-10"
            title={t.workspace.edit}
            disabled={disabled}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.536A4 4 0 019.707 15.7L7 16l.3-2.707A4 4 0 018.464 10.464L9 11z" />
            </svg>
          </button>
        </div>
      )}

      {valid === true && (
        <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
          OK
        </span>
      )}
      {valid === false && (
        <span className="shrink-0 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300">
          {t.workspace.invalid}
        </span>
      )}
    </div>
  );
}
