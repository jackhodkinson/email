import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Use existing gmail-skill credentials
const CONFIG_DIR = join(homedir(), ".config", "gmail-skill");
const CREDENTIALS_PATH = join(CONFIG_DIR, "client-credentials.json");
const TOKENS_PATH = join(CONFIG_DIR, "tokens.json");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

interface ClientCredentials {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}

export function getTokensPath(): string {
  return TOKENS_PATH;
}

export function loadCredentials(): ClientCredentials {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Client credentials not found at ${CREDENTIALS_PATH}\n` +
        `Please ensure gmail-skill is set up with valid OAuth credentials.`
    );
  }
  return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
}

export function loadTokens(): Tokens | null {
  if (!existsSync(TOKENS_PATH)) {
    return null;
  }
  return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
}

export function saveTokens(tokens: Tokens): void {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

export function createOAuth2Client() {
  const credentials = loadCredentials();
  const config = credentials.installed || credentials.web;

  if (!config) {
    throw new Error("Invalid credentials file format");
  }

  const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    "urn:ietf:wg:oauth:2.0:oob" // Out-of-band redirect
  );

  const tokens = loadTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);

    // Set up automatic token refresh and persist
    oauth2Client.on("tokens", (newTokens) => {
      const updatedTokens = { ...tokens, ...newTokens };
      saveTokens(updatedTokens as Tokens);
    });
  }

  return oauth2Client;
}

export function isAuthenticated(): boolean {
  const tokens = loadTokens();
  return tokens !== null && !!tokens.refresh_token;
}

// For syncing tokens to our database
export function getTokensForDb(): {
  access_token: string;
  refresh_token: string;
  token_expiry: number;
} | null {
  const tokens = loadTokens();
  if (!tokens) return null;
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: Math.floor(tokens.expiry_date / 1000), // Convert to seconds
  };
}

export { SCOPES };
