import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type Issue } from '@/lib/api';
import { clone, deepEqual, getAt, setAt, type Json } from '@/lib/json';
import { keys, useDraftMutations, validateConfig } from '@/lib/queries';
import { IssuesProvider } from './issues';
import type { Draft, Registry, ValidationResult } from '@/lib/types';

/**
 * The single editable registry document ("Arbeits-Draft").
 *
 * - Edits are local, immutable updates with undo/redo; nothing is live.
 * - Saving writes the draft with optimistic concurrency (draft_version).
 *   A conflict never overwrites silently; the user chooses explicitly.
 * - Validation is always the server's: unsaved validation of the edited
 *   document, debounced; issues are addressed by JSON Pointer.
 */

export type ValidationState = 'idle' | 'checking' | 'done' | 'failed';

export interface ValidationView {
  state: ValidationState;
  result: ValidationResult | null;
  issues: Issue[];
  /** The edited document changed after this validation ran. */
  stale: boolean;
  error: string | null;
}

export interface Conflict {
  server: Draft;
}

export interface WorkingDocument {
  draft: Draft | null;
  config: Registry | null;
  displayName: string;
  setDisplayName: (name: string) => void;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  conflict: Conflict | null;
  validation: ValidationView;
  autoValidate: boolean;
  setAutoValidate: (value: boolean) => void;
  open: (draft: Draft) => void;
  close: () => void;
  edit: (updater: (config: Registry) => Registry) => void;
  setAt: (pointer: string, value: Json | undefined) => void;
  replaceAll: (config: Registry) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<'saved' | 'conflict' | 'error'>;
  saveError: string | null;
  validateNow: () => Promise<void>;
  resolveConflict: (choice: 'take-server' | 'keep-local-as-new' | 'overwrite' | 'cancel') => Promise<void>;
}

const Context = createContext<WorkingDocument | null>(null);
const STORAGE_KEY = 'terra.workingDraft';
const HISTORY_LIMIT = 80;

function storedDraftId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function rememberDraftId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* optional convenience only; never holds credentials or document content */
  }
}

interface Snapshot {
  draft: Draft | null;
  config: Registry | null;
  name: string;
  past: Registry[];
  future: Registry[];
}

const IDLE: ValidationView = { state: 'idle', result: null, issues: [], stale: false, error: null };

export function WorkingDocumentProvider({ children, validateDebounceMs = 1200 }: { children: ReactNode; validateDebounceMs?: number }) {
  const client = useQueryClient();
  const { create, update } = useDraftMutations();
  const [snap, setSnap] = useState<Snapshot>({ draft: null, config: null, name: '', past: [], future: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [validation, setValidation] = useState<ValidationView>(IDLE);
  const [autoValidate, setAutoValidate] = useState(true);
  const validatedFor = useRef<Registry | null>(null);
  const runId = useRef(0);
  const latest = useRef(snap);
  latest.current = snap;

  const dirty = snap.draft !== null && snap.config !== null && (!deepEqual(snap.config, snap.draft.config) || snap.name !== (snap.draft.display_name ?? ''));

  const open = useCallback((draft: Draft) => {
    rememberDraftId(draft.draft_id);
    validatedFor.current = null;
    setValidation(IDLE);
    setSaveError(null);
    setConflict(null);
    setSnap({ draft, config: clone(draft.config), name: draft.display_name ?? '', past: [], future: [] });
  }, []);

  const close = useCallback(() => {
    rememberDraftId(null);
    validatedFor.current = null;
    setValidation(IDLE);
    setConflict(null);
    setSnap({ draft: null, config: null, name: '', past: [], future: [] });
  }, []);

  // Restore the previously opened draft after a reload (id only; content is re-read from the server).
  useEffect(() => {
    const id = storedDraftId();
    if (!id) return;
    api<Draft>(`registry/drafts/${encodeURIComponent(id)}`)
      .then((draft) => {
        if (latest.current.draft === null) open(draft);
      })
      .catch(() => rememberDraftId(null));
  }, [open]);

  const edit = useCallback((updater: (config: Registry) => Registry) => {
    setSnap((current) => {
      if (!current.config) return current;
      const next = updater(current.config);
      if (next === current.config || deepEqual(next, current.config)) return current;
      return { ...current, config: next, past: [...current.past, current.config].slice(-HISTORY_LIMIT), future: [] };
    });
  }, []);

  const setDisplayName = useCallback((name: string) => setSnap((c) => (c.draft ? { ...c, name } : c)), []);
  const setAtPointer = useCallback((pointer: string, value: Json | undefined) => edit((config) => setAt(config, pointer, value) as Registry), [edit]);
  const replaceAll = useCallback((config: Registry) => edit(() => config), [edit]);

  const undo = useCallback(() => {
    setSnap((c) => {
      const previous = c.past[c.past.length - 1];
      if (!previous || !c.config) return c;
      return { ...c, config: previous, past: c.past.slice(0, -1), future: [c.config, ...c.future] };
    });
  }, []);
  const redo = useCallback(() => {
    setSnap((c) => {
      const next = c.future[0];
      if (!next || !c.config) return c;
      return { ...c, config: next, past: [...c.past, c.config], future: c.future.slice(1) };
    });
  }, []);

  const validateNow = useCallback(async () => {
    const config = latest.current.config;
    if (!config) return;
    const id = ++runId.current;
    setValidation((v) => ({ ...v, state: 'checking', error: null }));
    try {
      const result = await validateConfig(config);
      if (id !== runId.current) return;
      validatedFor.current = config;
      setValidation({ state: 'done', result, issues: result.issues ?? [], stale: latest.current.config !== config, error: null });
    } catch (error) {
      if (id !== runId.current) return;
      validatedFor.current = config;
      if (error instanceof ApiError && error.kind === 'validation') {
        setValidation({ state: 'done', result: { valid: false, issues: error.issues }, issues: error.issues, stale: latest.current.config !== config, error: null });
      } else {
        setValidation({ state: 'failed', result: null, issues: [], stale: false, error: error instanceof Error ? error.message : 'Validierung fehlgeschlagen' });
      }
    }
  }, []);

  // Debounced unsaved validation after every edit.
  useEffect(() => {
    if (!snap.config) return;
    if (validatedFor.current !== null && validatedFor.current !== snap.config) {
      setValidation((v) => (v.stale ? v : { ...v, stale: true }));
    }
    if (!autoValidate || validatedFor.current === snap.config) return;
    const timer = setTimeout(() => void validateNow(), validateDebounceMs);
    return () => clearTimeout(timer);
  }, [snap.config, autoValidate, validateNow, validateDebounceMs]);

  // Unsaved changes: warn on leaving the page.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const save = useCallback(async () => {
    const { draft, config, name } = latest.current;
    if (!draft || !config) return 'error' as const;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await update.mutateAsync({ draft, config, display_name: name });
      setSnap((c) => (c.config === config ? { ...c, draft: saved } : { ...c, draft: saved }));
      return 'saved' as const;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'draft_version_conflict') {
        try {
          const server = await api<Draft>(`registry/drafts/${encodeURIComponent(draft.draft_id)}`);
          setConflict({ server });
          return 'conflict' as const;
        } catch {
          /* fall through to a plain error */
        }
      }
      setSaveError(error instanceof ApiError ? (error.code === 'persistence_unavailable' ? 'Persistenz nicht erreichbar – nichts gespeichert.' : `Speichern fehlgeschlagen: ${error.code}`) : 'Speichern fehlgeschlagen.');
      return 'error' as const;
    } finally {
      setSaving(false);
    }
  }, [update]);

  const resolveConflict = useCallback(
    async (choice: 'take-server' | 'keep-local-as-new' | 'overwrite' | 'cancel') => {
      const current = conflict;
      const { config, draft } = latest.current;
      if (!current || !config || !draft) return;
      if (choice === 'cancel') return setConflict(null);
      if (choice === 'take-server') {
        setConflict(null);
        return open(current.server);
      }
      if (choice === 'keep-local-as-new') {
        const created = await create.mutateAsync({ config, display_name: `${draft.display_name || draft.draft_id} (lokale Änderungen)` });
        setConflict(null);
        return open(created);
      }
      // Explicit overwrite: re-base on the server version the user has just seen.
      try {
        const saved = await update.mutateAsync({ draft: current.server, config, display_name: latest.current.name });
        setConflict(null);
        setSnap((c) => ({ ...c, draft: saved }));
      } catch (error) {
        setSaveError(error instanceof ApiError ? `Überschreiben fehlgeschlagen: ${error.code}` : 'Überschreiben fehlgeschlagen.');
        setConflict(null);
      }
    },
    [conflict, create, open, update],
  );

  // Keep derived server lists fresh after local saves.
  useEffect(() => {
    if (snap.draft) void client.invalidateQueries({ queryKey: keys.drafts });
  }, [snap.draft?.draft_version, snap.draft?.draft_id, client]);

  const value = useMemo<WorkingDocument>(
    () => ({
      draft: snap.draft,
      config: snap.config,
      displayName: snap.name,
      setDisplayName,
      dirty,
      canUndo: snap.past.length > 0,
      canRedo: snap.future.length > 0,
      saving,
      conflict,
      validation,
      autoValidate,
      setAutoValidate,
      open,
      close,
      edit,
      setAt: setAtPointer,
      replaceAll,
      undo,
      redo,
      save,
      saveError,
      validateNow,
      resolveConflict,
    }),
    [snap, dirty, saving, conflict, validation, autoValidate, open, close, edit, setAtPointer, setDisplayName, replaceAll, undo, redo, save, saveError, validateNow, resolveConflict],
  );

  return (
    <Context.Provider value={value}>
      <IssuesProvider value={validation.issues}>{children}</IssuesProvider>
    </Context.Provider>
  );
}

export function useWorkingDocument(): WorkingDocument {
  const value = useContext(Context);
  if (!value) throw new Error('WorkingDocumentProvider fehlt');
  return value;
}

/** Read a subtree of the working document. */
export function useDocAt<T extends Json | undefined>(pointer: string): T {
  const { config } = useWorkingDocument();
  return getAt(config, pointer) as T;
}
