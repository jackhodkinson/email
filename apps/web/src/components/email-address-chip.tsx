import { useState, useCallback } from "react";

export function parseEmailAddress(raw: string): {
  name: string;
  email: string;
} {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"(.*)"$/, "$1"),
      email: match[2],
    };
  }
  return { name: raw, email: raw };
}

export function EmailAddressChip({ raw }: { raw: string }) {
  const { name, email } = parseEmailAddress(raw);
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [email],
  );

  return (
    <button
      type="button"
      className="email-address-chip"
      title={copied ? "Copied!" : email}
      onClick={handleClick}
    >
      {name}
    </button>
  );
}
