export function NoAccount() {
  return (
    <div className="empty-state">
      <h1 className="empty-state__title">Welcome to Email</h1>
      <p className="empty-state__text">
        No account found. Please run the bootstrap and sync scripts first.
      </p>
      <div className="code-block">
        <p>1. Bootstrap account:</p>
        <p className="ml-4">bun run src/lib/gmail/test-sync.ts</p>
      </div>
    </div>
  );
}
