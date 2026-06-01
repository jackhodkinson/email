import { google } from "googleapis";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".config", "gmail-skill");
const CREDENTIALS_PATH = join(CONFIG_DIR, "client-credentials.json");
const TOKENS_PATH = join(CONFIG_DIR, "tokens.json");

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

function loadCredentials(): ClientCredentials {
  const file = Bun.file(CREDENTIALS_PATH);
  if (!file.size) {
    throw new Error(
      `Client credentials not found at ${CREDENTIALS_PATH}\n` +
        `Please download your OAuth 2.0 credentials from Google Cloud Console and save them there.`
    );
  }
  // Use sync read since this is a CLI startup path
  const { readFileSync } = require("fs");
  return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
}

function loadTokens(): Tokens | null {
  const { existsSync, readFileSync } = require("fs");
  if (!existsSync(TOKENS_PATH)) {
    return null;
  }
  return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
}

function saveTokens(tokens: Tokens): void {
  const { writeFileSync } = require("fs");
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
    "urn:ietf:wg:oauth:2.0:oob"
  );

  const tokens = loadTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);

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

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
];

export function getAuthUrl(): string {
  const credentials = loadCredentials();
  const config = credentials.installed || credentials.web;
  if (!config) throw new Error("Invalid credentials file format");

  const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const credentials = loadCredentials();
  const config = credentials.installed || credentials.web;
  if (!config) throw new Error("Invalid credentials file format");

  const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  const { tokens } = await oauth2Client.getToken(code);
  saveTokens(tokens as Tokens);
}

// ── Web-app OAuth flow (arbitrary redirect URI) ─────────────────────────────
//
// Google deprecated the OOB ("urn:ietf:wg:oauth:2.0:oob") flow used by the CLI.
// The web app uses a normal redirect URI flow so the user can complete sign-in
// entirely in the browser.

export function credentialsConfigured(): boolean {
  const { existsSync } = require("fs");
  return existsSync(CREDENTIALS_PATH);
}

export function getAuthUrlForRedirect(redirectUri: string): string {
  const credentials = loadCredentials();
  const config = credentials.installed || credentials.web;
  if (!config) throw new Error("Invalid credentials file format");

  const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    redirectUri,
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokensWithRedirect(
  code: string,
  redirectUri: string,
): Promise<void> {
  const credentials = loadCredentials();
  const config = credentials.installed || credentials.web;
  if (!config) throw new Error("Invalid credentials file format");

  const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    redirectUri,
  );

  const { tokens } = await oauth2Client.getToken(code);
  saveTokens(tokens as Tokens);
}
