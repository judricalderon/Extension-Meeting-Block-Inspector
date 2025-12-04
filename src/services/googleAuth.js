// src/services/googleAuth.js

import { getConfig } from "../storage/storage.js";

const TOKEN_KEY = "calendar_analytics_token";

export async function getAccessToken() {
  const stored = await getStoredToken();

  if (stored && !isTokenExpired(stored)) {
    return stored.access_token;
  }

  // If expired or missing → ask user to authenticate again
  return await authenticateUser();
}

function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TOKEN_KEY], (res) => {
      resolve(res[TOKEN_KEY] || null);
    });
  });
}

function saveToken(tokenObj) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TOKEN_KEY]: tokenObj }, () => resolve(true));
  });
}

function isTokenExpired(tokenObj) {
  const now = Date.now();
  return now >= tokenObj.expires_at;
}

/**
 * Launches Google OAuth.
 * Uses chrome.identity.launchWebAuthFlow with implicit token flow.
 */
export async function authenticateUser() {
  const config = await getConfig();

  const clientId =
    config.googleClientId && config.googleClientId.length > 0
      ? config.googleClientId
      : DEFAULT_CLIENT_ID;

  const redirectUri = chrome.identity.getRedirectURL(); // extension redirect
  const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.readonly");

  const authUrl =
    "https://accounts.google.com/o/oauth2/auth" +
    `?client_id=${clientId}` +
    "&response_type=token" + // implicit flow
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    "&include_granted_scopes=true" +
    "&prompt=consent";

  console.log("[Calendar-Analytics] OAuth URL:", authUrl);

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      async (redirectResponseUrl) => {
        if (chrome.runtime.lastError) {
          console.error("[Calendar-Analytics] OAuth error:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }

        if (!redirectResponseUrl) {
          reject(new Error("Empty redirect URL"));
          return;
        }

        // Extract access_token from URL fragment
        const params = new URLSearchParams(
          redirectResponseUrl.split("#")[1] // fragment after '#'
        );

        const accessToken = params.get("access_token");
        const expiresIn = parseInt(params.get("expires_in"), 10);

        if (!accessToken) {
          reject(new Error("No access_token found in redirect URL"));
          return;
        }

        const expiresAt = Date.now() + expiresIn * 1000;

        const tokenObj = {
          access_token: accessToken,
          expires_at: expiresAt
        };

        await saveToken(tokenObj);
        resolve(accessToken);
      }
    );
  });
}

// Default Client ID in case the user does not configure their own
const DEFAULT_CLIENT_ID = "REPLACE_THIS_WITH_YOUR_DEFAULT.apps.googleusercontent.com";
