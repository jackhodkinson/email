export function getNextEmailIdAfterArchive<T extends { id: string }>(
  visibleEmails: T[],
  archivedEmailIds: Iterable<string>,
  anchorEmailId?: string,
): string | null {
  const archivedIdSet = new Set(archivedEmailIds);
  if (visibleEmails.length === 0 || archivedIdSet.size === 0) return null;

  const anchorIndex =
    anchorEmailId && archivedIdSet.has(anchorEmailId)
      ? visibleEmails.findIndex((email) => email.id === anchorEmailId)
      : visibleEmails.findIndex((email) => archivedIdSet.has(email.id));

  if (anchorIndex < 0) return null;

  for (let index = anchorIndex + 1; index < visibleEmails.length; index++) {
    const email = visibleEmails[index];
    if (email && !archivedIdSet.has(email.id)) return email.id;
  }

  for (let index = anchorIndex - 1; index >= 0; index--) {
    const email = visibleEmails[index];
    if (email && !archivedIdSet.has(email.id)) return email.id;
  }

  return null;
}
