import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { UsageLimitsState } from '../types';
import {
  canUseRemoteAnalysis as serviceCanUseRemote,
  consumeChatCredit as serviceConsumeChatCredit,
  loadUsageState,
  UsageServiceCategory,
} from '../services/usageLimitsService';

interface UsageContextValue {
  usageState: UsageLimitsState | null;
  setActiveOrganization: (organizationId: string | null, userId?: string | null) => void;
  refreshUsage: () => Promise<void>;
  canUseRemoteAnalysis: (category?: UsageServiceCategory) => boolean;
  consumeChatCredit: () => Promise<number>;
  registerMediaConsumption: () => void;
}

const UsageLimitsContext = createContext<UsageContextValue | undefined>(undefined);

export const UsageLimitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usageState, setUsageState] = useState<UsageLimitsState | null>(null);
  const activeOrgIdRef = useRef<string | null>(null);
  const activeUserIdRef = useRef<string | null>(null);

  const syncUsage = useCallback(async (organizationId: string, uid: string) => {
    try {
      const state = await loadUsageState(organizationId, uid);
      setUsageState(state);
    } catch (error) {
      console.warn('No se pudo sincronizar la cuota remota.', error);
    }
  }, []);

  const setActiveOrganization = useCallback(
    (organizationId: string | null, userId?: string | null) => {
      activeOrgIdRef.current = organizationId;
      activeUserIdRef.current = userId ?? null;

      if (!organizationId || !userId) {
        setUsageState(null);
        return;
      }

      void syncUsage(organizationId, userId);
    },
    [syncUsage]
  );

  const refreshUsage = useCallback(async () => {
    const orgId = activeOrgIdRef.current;
    const userId = activeUserIdRef.current;
    if (!orgId || !userId) return;
    await syncUsage(orgId, userId);
  }, [syncUsage]);

  const consumeChatCredit = useCallback(async () => {
    const orgId = activeOrgIdRef.current;
    const userId = activeUserIdRef.current;
    if (!orgId || !userId) {
      throw new Error('NO_USAGE_CONTEXT');
    }

    const remaining = await serviceConsumeChatCredit(orgId);
    let updated = false;
    setUsageState(prev => {
      if (!prev) return prev;
      updated = true;
      return {
        ...prev,
        chatRemaining: remaining,
        lastSyncedAt: new Date().toISOString(),
      };
    });

    if (!updated) {
      await refreshUsage();
    }

    return remaining;
  }, [refreshUsage]);

  const registerMediaConsumption = useCallback(() => {
    setUsageState(prev => {
      if (!prev) return prev;
      const nextRemaining =
        typeof prev.mediaRemaining === 'number' ? Math.max(prev.mediaRemaining - 1, 0) : prev.mediaRemaining;
      return {
        ...prev,
        mediaRemaining: nextRemaining,
        lastSyncedAt: new Date().toISOString(),
      };
    });
  }, []);

  const canUseRemoteAnalysis = useCallback(
    (category: UsageServiceCategory = 'document') => serviceCanUseRemote(usageState, category),
    [usageState]
  );

  const value = useMemo<UsageContextValue>(
    () => ({
      usageState,
      setActiveOrganization,
      refreshUsage,
      canUseRemoteAnalysis,
      consumeChatCredit,
      registerMediaConsumption,
    }),
    [usageState, setActiveOrganization, refreshUsage, canUseRemoteAnalysis, consumeChatCredit, registerMediaConsumption]
  );

  return <UsageLimitsContext.Provider value={value}>{children}</UsageLimitsContext.Provider>;
};

export const useUsageLimits = (): UsageContextValue => {
  const context = useContext(UsageLimitsContext);
  if (!context) {
    throw new Error('useUsageLimits must be used within a UsageLimitsProvider');
  }
  return context;
};

export type { UsageServiceCategory } from '../services/usageLimitsService';
