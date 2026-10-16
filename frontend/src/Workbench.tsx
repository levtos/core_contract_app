import { lazy, Suspense, useState } from 'react';
import { createHashRouter, Navigate, RouterProvider, useLocation, type RouteObject } from 'react-router';
import { legacyTarget } from '@/lib/navigation';
import { RouteError } from '@/components/RouteError';
import { Shell } from '@/components/Shell';
import { Spinner } from '@/components/ui/layout';
import { WorkingDocumentProvider } from '@/features/authoring/WorkingDocument';
import type { LiveStore } from '@/lib/live';
import { LiveProvider } from '@/lib/live-context';
import { CapabilitySchemaProvider } from '@/lib/schema-context';
import { SetupContext } from '@/lib/setup-context';
import { OverviewPage } from '@/features/overview/OverviewPage';

const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => {
  const Page = lazy(load);
  return (
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  );
};

/** Hash routing: the static Ingress server has no SPA fallback and an unknown URL prefix. */
function LegacyRoute() {
  const location = useLocation();
  return <Navigate replace to={legacyTarget(location.pathname, location.search)} />;
}

export function workbenchRoutes(onSetup: () => void): RouteObject[] {
  return [
    {
      path: '/',
      element: <Shell onSetup={onSetup} />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <OverviewPage /> },
        { path: 'contracts/list/all', element: lazyPage(() => import('@/features/contracts/ContractsPage')) },
        { path: 'contracts/select/contract', element: lazyPage(() => import('@/features/contracts/ContractChooser')) },
        { path: 'contracts/view/:contractId', element: lazyPage(() => import('@/features/contracts/ContractDetailPage')) },
        { path: 'contracts/import/json', element: lazyPage(() => import('@/features/registry/ImportExportPage')) },
        { path: 'contracts/relations/graph', element: lazyPage(() => import('@/features/graph/GraphPage')) },
        { path: 'templates/own', element: lazyPage(() => import('@/features/contracts/DefinitionsPage')) },
        { path: 'templates/built-in', element: lazyPage(() => import('@/features/contracts/DefinitionsPage')) },
        { path: 'templates/details/:typeId/:version', element: lazyPage(() => import('@/features/contracts/DefinitionDetailPage')) },
        ...['devices', 'bindings', 'catalogs', 'dependencies'].map(section => ({ path: `sources/${section}`, element: lazyPage(() => import('@/features/sources/SourcesPage')) })),
        ...['drafts', 'versions'].map(section => ({ path: `changes/${section}`, element: lazyPage(() => import('@/features/registry/RegistryPage')) })),
        { path: 'changes/transfer', element: lazyPage(() => import('@/features/registry/ImportExportPage')) },
        { path: 'changes/drafts/:draftId', element: lazyPage(() => import('@/features/registry/DraftPage')) },
        ...['system', 'installation', 'connections', 'keys', 'log'].map(section => ({ path: `settings/${section}`, element: lazyPage(() => import('@/features/admin/AdminPage')) })),
        { path: 'settings/diagnostics', element: lazyPage(() => import('@/features/diagnostics/DiagnosticsPage')) },
        ...['contracts', 'contracts/:contractId', 'definitions', 'definitions/:typeId/:version', 'sources', 'registry', 'registry/drafts/:draftId', 'graph', 'diagnostics', 'admin'].map(path => ({ path, element: <LegacyRoute /> })),
        { path: '*', element: <OverviewPage /> },
      ],
    },
  ];
}

export function Workbench({ onSetup, live }: { onSetup: () => void; live?: LiveStore }) {
  const [router] = useState(() => createHashRouter(workbenchRoutes(onSetup)));
  return (
    <LiveProvider store={live}>
      <SetupContext.Provider value={onSetup}>
        <CapabilitySchemaProvider>
          <WorkingDocumentProvider>
            <RouterProvider router={router} />
          </WorkingDocumentProvider>
        </CapabilitySchemaProvider>
      </SetupContext.Provider>
    </LiveProvider>
  );
}
