import { GmailClient, getHeader } from "./client";

async function main() {
  console.log("Testing Gmail Client...\n");

  // Create client
  const client = GmailClient.create();
  console.log("Client created successfully\n");

  // Get profile
  const profile = await client.getProfile();
  console.log("=== Profile ===");
  console.log("Email:", profile.emailAddress);
  console.log("History ID:", profile.historyId);
  console.log();

  // List messages
  const messages = await client.listMessages({ maxResults: 5 });
  console.log("=== Messages ===");
  console.log("Count:", messages.messages?.length ?? 0);
  console.log();

  // Get one full message
  if (messages.messages?.[0]) {
    const messageId = messages.messages[0].id!;
    const full = await client.getMessage(messageId);
    console.log("=== Full Message ===");
    console.log("ID:", full.id);
    console.log("Subject:", getHeader(full.payload?.headers, "Subject"));
    console.log("From:", getHeader(full.payload?.headers, "From"));
    console.log("Date:", getHeader(full.payload?.headers, "Date"));
    console.log("Snippet:", full.snippet?.substring(0, 100) + "...");
  }

  console.log("\nTest completed successfully!");
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
