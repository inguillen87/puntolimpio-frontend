import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { UsageLimitsState, UsagePlanSeed } from '../types';
import {
  canUseRemoteAnalysis as serviceCanUseRemote,
  clearUpgradeRequest as serviceClearUpgradeRequest,
  loadUsageState,
  markDegraded as serviceMarkDegraded,
  recordUsage,
  requestUpgrade as serviceRequestUpgrade,
  setPlan as serviceSetPlan,
  UsageServiceCategory,
} from '../services/usageLimitsService';

interface UsageContextValue {
  usageState: UsageLimitsState | null;
  setActiveOrganization: (organizationId: string | null, seed?: UsagePlanSeed) => void;
  refreshUsage: () => void;
  recordRemoteUsage: (category: UsageServiceCategory, amount?: number) => void;
  canUseRemoteAnalysis: (category?: UsageServiceCategory) => boolean;
  requestUpgrade: () => void;
  clearUpgradeRequest: () => void;
  forceDegradedMode: (reason?: string) => void;
  updatePlan: (seed: UsagePlanSeed) => void;
}

const UsageLimitsContext = createContext<UsageContextValue | undefined>(undefined);

export const UsageLimitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usageState, setUsageState] = useState<UsageLimitsState | null>(null);
  const activeOrgIdRef = useRef<string | null>(null);
  const seedRef = useRef<UsagePlanSeed | undefined>(undefined);

  const syncUsage = useCallback((orgId: string, seed?: UsagePlanSeed) => {
    const state = loadUsageState(orgId, seed ?? seedRef.current);
    setUsageState(state);
  }, []);

  const setActiveOrganization = useCallback((organizationId: string | null, seed?: UsagePlanSeed) => {
    activeOrgIdRef.current = organizationId;
    if (seed) {
      seedRef.current = { ...seedRef.current, ...seed };
    }

    if (!organizationId) {
      setUsageState(null);
      return;
    }
    syncUsage(organizationId, seed);
  }, [syncUsage]);

  const refreshUsage = useCallback(() => {
    const orgId = activeOrgIdRef.current;
    if (!orgId) return;
    syncUsage(orgId);
  }, [syncUsage]);

  const recordRemoteUsage = useCallback((category: UsageServiceCategory, amount: number = 1) => {
    const orgId = activeOrgIdRef.current;
    if (!orgId) return;
    const updated = recordUsage(orgId, category, amount);
    setUsageState(updated);
  }, []);

  const canUseRemoteAnalysis = useCallback((category?: UsageServiceCategory) => {
    void category; // Category reserved for future segmented limits
    return serviceCanUseRemote(usageState);
  }, [usageState]);

  const requestUpgrade = useCallback(() => {
    const orgId = activeOrgIdRef.current;
    if (!orgId) return;
    const updated = serviceRequestUpgrade(orgId);
    setUsageState(updated);
  }, []);

  const clearUpgradeRequest = useCallback(() => {
    const orgId = activeOrgIdRef.current;
    if (!orgId) return;
    const updated = serviceClearUpgradeRequest(orgId);
    setUsageState(updated);
  }, []);

  const forceDegradedMode = useCallback((reason?: string) => {
    const orgId = activeOrgIdRef.current;
    if (!orgId) return;
    const updated = serviceMarkDegraded(orgId, reason);
    setUsageState(updated);
  }, []);

  const updatePlan = useCallback((seed: UsagePlanSeed) => {
    const orgId = activeOrgIdRef.current;
    if (!orgId) return;
    seedRef.current = { ...seedRef.current, ...seed };
    const updated = serviceSetPlan(orgId, seed);
    setUsageState(updated);
  }, []);

  const value = useMemo<UsageContextValue>(() => ({
    usageState,
    setActiveOrganization,
    refreshUsage,
    recordRemoteUsage,
    canUseRemoteAnalysis,
    requestUpgrade,
    clearUpgradeRequest,
    forceDegradedMode,
    updatePlan,
  }), [usageState, setActiveOrganization, refreshUsage, recordRemoteUsage, canUseRemoteAnalysis, requestUpgrade, clearUpgradeRequest, forceDegradedMode, updatePlan]);

  return (
    <UsageLimitsContext.Provider value={value}>
      {children}
    </UsageLimitsContext.Provider>
  );
};

export const useUsageLimits = (): UsageContextValue => {
  const context = useContext(UsageLimitsContext);
  if (!context) {
    throw new Error('useUsageLimits must be used within a UsageLimitsProvider');
  }
  return context;
};

export type { UsageServiceCategory } from '../services/usageLimitsService';
