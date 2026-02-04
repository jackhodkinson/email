export function NoAccount() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-semibold">Welcome to Email</h1>
      <p className="text-muted-foreground">
        No account found. Please run the bootstrap and sync scripts first.
      </p>
      <div className="text-sm text-muted-foreground bg-muted p-4 rounded-md font-mono">
        <p>1. Bootstrap account:</p>
        <p className="ml-4">bun run src/lib/gmail/test-sync.ts</p>
      </div>
    </div>
  );
}
