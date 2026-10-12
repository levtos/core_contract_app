import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Capabilities } from './capabilities';
import type { Json, JsonObject } from './json';
import type {
  CommandResult,
  ContractDiagnosis,
  Diagnostics,
  Draft,
  HaEntityPage,
  HistoryPage,
  Info,
  Problems,
  Registry,
  RevisionRow,
  TokenRotation,
  ValidationResult,
} from './types';

export const keys = {
  info: ['info'] as const,
  capabilities: ['capabilities'] as const,
  active: ['registry', 'active'] as const,
  export: ['registry', 'export'] as const,
  revisions: ['registry', 'revisions'] as const,
  drafts: ['registry', 'drafts'] as const,
  draft: (id: string) => ['registry', 'drafts', id] as const,
  diagnostics: ['diagnostics'] as const,
  problems: ['diagnostics', 'problems'] as const,
  diagnosis: (id: string) => ['diagnostics', 'contracts', id] as const,
  sources: ['sources'] as const,
  bindings: ['bindings'] as const,
  definitions: ['definitions'] as const,
  history: (kind: string, filters: object) => ['history', kind, filters] as const,
  ha: (search: string) => ['ha-entities', search] as const,
};

export const useInfo = () => useQuery({ queryKey: keys.info, queryFn: () => api<Info>('info') });

/** Capability metadata is the contract for every editor; refetched after activation. */
export const useCapabilities = () =>
  useQuery({
    queryKey: keys.capabilities,
    queryFn: () => api<Capabilities>('capabilities'),
    staleTime: 60_000,
  });

export const useActiveRevision = () =>
  useQuery({
    queryKey: keys.active,
    queryFn: () => api<RevisionRow | null>('registry/active'),
  });

/** The active configuration, or `null` when no registry has been activated yet (HTTP 409). */
export const useActiveExport = () =>
  useQuery({
    queryKey: keys.export,
    queryFn: async () => {
      try {
        return await api<Registry>('registry/active/export');
      } catch (error) {
        if (error instanceof ApiError && error.code === 'no_active_registry') return null;
        throw error;
      }
    },
  });

export const useRevisions = () =>
  useQuery({
    queryKey: keys.revisions,
    queryFn: () => api<RevisionRow[]>('registry/revisions'),
  });

export const useDrafts = () =>
  useQuery({ queryKey: keys.drafts, queryFn: () => api<Draft[]>('registry/drafts') });

export const useDiagnostics = (refetchMs: number | false = 5000) =>
  useQuery({
    queryKey: keys.diagnostics,
    queryFn: () => api<Diagnostics>('diagnostics'),
    refetchInterval: refetchMs,
  });

export const useProblems = (refetchMs: number | false = 5000) =>
  useQuery({
    queryKey: keys.problems,
    queryFn: () => api<Problems>('diagnostics/problems'),
    refetchInterval: refetchMs,
  });

export const useContractDiagnosis = (contractId: string | undefined) =>
  useQuery({
    queryKey: keys.diagnosis(contractId ?? ''),
    queryFn: () => api<ContractDiagnosis>(`diagnostics/contracts/${encodeURIComponent(contractId!)}`),
    enabled: !!contractId,
    refetchInterval: 5000,
    retry: (count, error) => !(error instanceof ApiError && error.kind === 'not_found') && count < 2,
  });

export const useSources = () =>
  useQuery({ queryKey: keys.sources, queryFn: () => api<JsonObject[]>('sources') });
export const useBindings = () =>
  useQuery({ queryKey: keys.bindings, queryFn: () => api<JsonObject[]>('bindings') });

export interface HistoryFilters {
  contract_id?: string;
  source_id?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export function historyPath(kind: string, filters: HistoryFilters, cursor?: string | null): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  if (cursor) query.set('cursor', cursor);
  const text = query.toString();
  return `history/query/${encodeURIComponent(kind)}${text ? `?${text}` : ''}`;
}

/** Cursor-paged history; the cursor is opaque and bound to the filter scope. */
export const useHistory = (kind: string, filters: HistoryFilters, enabled = true) =>
  useInfiniteQuery({
    queryKey: keys.history(kind, filters),
    queryFn: ({ pageParam }) => api<HistoryPage>(historyPath(kind, filters, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled,
    placeholderData: keepPreviousData,
  });

export const useHaEntities = (search: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: keys.ha(search),
    queryFn: ({ pageParam }) =>
      api<HaEntityPage>(`ha/entities?limit=200${pageParam ? `&after=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled,
    retry: false,
    staleTime: 15_000,
  });

export function useDraftMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: keys.drafts });
  return {
    create: useMutation({
      mutationFn: (input: { config: Registry; display_name?: string; draft_id?: string }) =>
        api<Draft>('registry/drafts', { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (input: { draft: Draft; config: Registry; display_name?: string }) =>
        api<Draft>(`registry/drafts/${encodeURIComponent(input.draft.draft_id)}`, {
          method: 'PUT',
          body: {
            config: input.config,
            draft_version: input.draft.draft_version,
            ...(input.display_name !== undefined ? { display_name: input.display_name } : {}),
          },
        }),
      onSuccess: (draft) => {
        client.setQueryData(keys.draft(draft.draft_id), draft);
        void refresh();
      },
    }),
    remove: useMutation({
      mutationFn: (draft: Draft) =>
        api<{ deleted: boolean }>(`registry/drafts/${encodeURIComponent(draft.draft_id)}`, {
          method: 'DELETE',
          body: { draft_version: draft.draft_version },
        }),
      onSuccess: refresh,
    }),
  };
}

/** Validation without saving; the same validator serves drafts and imports. */
export const validateConfig = (config: Registry) =>
  api<ValidationResult>('registry/validate', { method: 'POST', body: config });

export function useActivation() {
  const client = useQueryClient();
  const done = () =>
    Promise.all(
      [keys.active, keys.export, keys.revisions, keys.drafts, keys.capabilities, keys.sources, keys.bindings, keys.diagnostics].map(
        (key) => client.invalidateQueries({ queryKey: key }),
      ),
    );
  return {
    activate: useMutation({
      mutationFn: (input: { draft: Draft; expectedActiveRevision: number }) =>
        api<RevisionRow>(`registry/drafts/${encodeURIComponent(input.draft.draft_id)}/activate`, {
          method: 'POST',
          body: {
            draft_version: input.draft.draft_version,
            expected_active_revision: input.expectedActiveRevision,
          },
        }),
      onSuccess: done,
    }),
    rollback: useMutation({
      mutationFn: (input: { revision: number; expectedActiveRevision: number }) =>
        api<RevisionRow>('registry/rollback', {
          method: 'POST',
          body: { revision: input.revision, expected_active_revision: input.expectedActiveRevision },
        }),
      onSuccess: done,
    }),
  };
}

export const useRotateToken = () =>
  useMutation({
    mutationFn: (role: 'admin' | 'consumer') =>
      api<TokenRotation>('tokens/rotate', { method: 'POST', body: { role } }),
  });

export const useSubmitCommand = () =>
  useMutation({
    mutationFn: (command: JsonObject) => api<CommandResult>('commands', { method: 'POST', body: command }),
  });

export type { Json };
