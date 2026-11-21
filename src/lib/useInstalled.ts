import { useSyncExternalStore } from 'react';
import { isInstalled, onInstallAvailabilityChange } from './install';

/** Whether the app is installed on this device, kept up to date as the browser learns more. */
export const useInstalled = () => useSyncExternalStore(onInstallAvailabilityChange, isInstalled, () => false);
