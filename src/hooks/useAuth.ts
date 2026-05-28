import { useState, useEffect, useCallback } from 'react';
import { PublicClientApplication } from '@azure/msal-browser';
import type { AccountInfo } from '@azure/msal-browser';
import { msalConfig, tokenRequest } from '../config/auth.ts';

// Module-level singleton — initialised once for the app lifetime.
const msalInstance = new PublicClientApplication(msalConfig);

export interface AuthState {
  isAuthenticated: boolean;
  account: AccountInfo | null;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

export function useAuth(): AuthState {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    msalInstance
      .initialize()
      .then(() => {
        if (cancelled) return;
        const accounts = msalInstance.getAllAccounts();
        setAccount(accounts[0] ?? null);
        setIsLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Failed to initialise authentication',
        );
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async () => {
    try {
      setError(null);
      const result = await msalInstance.loginPopup(tokenRequest);
      setAccount(result.account);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await msalInstance.logoutPopup({ account: account ?? undefined });
      setAccount(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Logout failed');
    }
  }, [account]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!account) return null;
    try {
      const result = await msalInstance.acquireTokenSilent({
        ...tokenRequest,
        account,
      });
      return result.accessToken;
    } catch {
      // Silent acquisition failed (e.g. token expired) — fall back to popup.
      try {
        const result = await msalInstance.acquireTokenPopup({
          ...tokenRequest,
          account,
        });
        return result.accessToken;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to acquire token');
        return null;
      }
    }
  }, [account]);

  return { isAuthenticated: !!account, account, isLoading, error, login, logout, getToken };
}
