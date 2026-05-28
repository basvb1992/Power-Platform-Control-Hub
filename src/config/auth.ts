import type { Configuration, PopupRequest } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID ?? 'organizations'}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

/**
 * Scope for the Power Platform API.
 * Using `.default` grants all delegated permissions that were consented in the
 * app registration (e.g. ResourceQuery.Resources.Read).
 */
export const tokenRequest: PopupRequest = {
  scopes: ['https://api.powerplatform.com/.default'],
};
