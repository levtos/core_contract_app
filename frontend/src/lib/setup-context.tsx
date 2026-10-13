import { createContext, useContext } from 'react';

/** Re-opens the first-run assistant (never changes configuration by itself). */
export const SetupContext = createContext<() => void>(() => undefined);
export const useOpenSetup = () => useContext(SetupContext);
