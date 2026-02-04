// Task 1.3 test: Verify OAuth authentication works
import { isAuthenticated, createOAuth2Client } from "./auth";
import { google } from "googleapis";

const authenticated = isAuthenticated();
if (!authenticated) {
  console.error("✗ isAuthenticated() returned false");
  process.exit(1);
}

const client = createOAuth2Client();
const gmail = google.gmail({ version: "v1", auth: client });
const profile = await gmail.users.getProfile({ userId: "me" });

if (profile.data.emailAddress) {
  console.log(`✓ Task 1.3 verified: OAuth working for ${profile.data.emailAddress}`);
} else {
  console.error("✗ Could not fetch profile");
  process.exit(1);
}
