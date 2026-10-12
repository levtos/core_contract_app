import { lazy, Suspense, useState } from 'react';
import { createHashRouter, RouterProvider, type RouteObject } from 'react-router';
import { Shell } from '@/components/Shell';
import { Spinner } from '@/components/ui/layout';
import { LiveProvider } from '@/lib/live-context';
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
export function workbenchRoutes(onSetup: () => void): RouteObject[] {
  return [
    {
      path: '/',
      element: <Shell onSetup={onSetup} />,
      children: [
        { index: true, element: <OverviewPage /> },
        { path: 'contracts', element: lazyPage(() => import('@/features/contracts/ContractsPage')) },
        { path: 'contracts/:contractId', element: lazyPage(() => import('@/features/contracts/ContractDetailPage')) },
        { path: 'definitions', element: lazyPage(() => import('@/features/contracts/DefinitionsPage')) },
        { path: 'definitions/:typeId/:version', element: lazyPage(() => import('@/features/contracts/DefinitionDetailPage')) },
        { path: 'sources', element: lazyPage(() => import('@/features/sources/SourcesPage')) },
        { path: 'registry', element: lazyPage(() => import('@/features/registry/RegistryPage')) },
        { path: 'registry/drafts/:draftId', element: lazyPage(() => import('@/features/registry/DraftPage')) },
        { path: 'graph', element: lazyPage(() => import('@/features/graph/GraphPage')) },
        { path: 'diagnostics', element: lazyPage(() => import('@/features/diagnostics/DiagnosticsPage')) },
        { path: 'admin', element: lazyPage(() => import('@/features/admin/AdminPage')) },
        { path: '*', element: <OverviewPage /> },
      ],
    },
  ];
}

export function Workbench({ onSetup }: { onSetup: () => void }) {
  const [router] = useState(() => createHashRouter(workbenchRoutes(onSetup)));
  return (
    <LiveProvider>
      <RouterProvider router={router} />
    </LiveProvider>
  );
}
