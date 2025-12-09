// src/services/googleAuth.js
/**
 * Google Authentication Service
 *
 * This module handles OAuth-based authentication with Google
 * and provides helpers to:
 * - Check if there is a valid access token stored.
 * - Retrieve an access token (reusing or refreshing via OAuth).
 * - Launch the Google OAuth implicit flow using chrome.identity.
 *
 * Tokens are stored in chrome.storage.local with an explicit expiration timestamp.
 */
import { getConfig } from "../storage/storage.js";

const TOKEN_KEY = "calendar_analytics_token";
// al inicio del archivo ya tienes TOKEN_KEY, getStoredToken, isTokenExpired

/**
 * Checks whether there is a valid (non-expired) token stored.
 *
 * @returns {Promise<boolean>} True if a valid token is available, false otherwise.
 */
export async function hasValidToken() {
  const stored = await getStoredToken();
  return stored && !isTokenExpired(stored);
}

/**
 * Retrieves a valid access token.
 *
 * Flow:
 * - If a non-expired token is stored, returns it.
 * - Otherwise, triggers the OAuth flow to obtain a new token.
 *
 * @returns {Promise<string>} A valid Google OAuth access token.
 */
export async function getAccessToken() {
  const stored = await getStoredToken();

  if (stored && !isTokenExpired(stored)) {
    return stored.access_token;
  }

  // If expired or missing → ask user to authenticate again
  return await authenticateUser();
}

/**
 * Retrieves the stored token object from chrome.storage.local.
 *
 * @returns {Promise<{ access_token: string; expires_at: number } | null>}
 */
function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TOKEN_KEY], (res) => {
      resolve(res[TOKEN_KEY] || null);
    });
  });
}

/**
 * Persists the token object into chrome.storage.local.
 *
 * @param {{ access_token: string; expires_at: number }} tokenObj - Token object to be stored.
 * @returns {Promise<boolean>} Resolves to true when the token is saved.
 */
function saveToken(tokenObj) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TOKEN_KEY]: tokenObj }, () => resolve(true));
  });
}

/**
 * Checks whether a token object is expired given its `expires_at` timestamp.
 *
 * @param {{ expires_at: number }} tokenObj - Token object containing an expiration timestamp in ms.
 * @returns {boolean} True if the token is expired, false otherwise.
 */
function isTokenExpired(tokenObj) {
  const now = Date.now();
  return now >= tokenObj.expires_at;
}

/**
 * Launches the Google OAuth implicit flow and returns a fresh access token.
 *
 * This function:
 * - Reads the extension configuration to decide which Client ID to use.
 * - Builds the OAuth URL with the `calendar.readonly` scope.
 * - Uses chrome.identity.launchWebAuthFlow to open the consent screen.
 * - Parses the redirect URL fragment to extract `access_token` and `expires_in`.
 * - Stores the token and its expiration timestamp in chrome.storage.local.
 *
 * @returns {Promise<string>} The newly obtained access token.
 * @throws {Error} If the OAuth flow fails or the redirect URL does not contain an access token.
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

/**
 * Default Client ID used when the user does not configure their own
 * Google OAuth client via the extension settings.
 *
 * Replace this placeholder with a real OAuth client ID before publishing.
 */
const DEFAULT_CLIENT_ID = "REPLACE_THIS_WITH_YOUR_DEFAULT.apps.googleusercontent.com";
