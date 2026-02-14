export function NoAccount() {
  return (
    <div className="empty-state">
      <h1 className="empty-state__title">Welcome to Email</h1>
      <p className="empty-state__text">
        No authenticated Gmail account found for the shared mailbox.
      </p>
      <div className="code-block">
        <p>1. Authenticate in terminal:</p>
        <p className="ml-4">cmail auth</p>
        <p>2. Run first sync:</p>
        <p className="ml-4">cmail sync</p>
      </div>
    </div>
  );
}
