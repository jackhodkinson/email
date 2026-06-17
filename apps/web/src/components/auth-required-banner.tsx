import { useCallback, useEffect, useState } from "react";
import { AUTH_ERROR_EVENT } from "../lib/auth-error";

export function AuthRequiredBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(AUTH_ERROR_EVENT, show);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, show);
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  if (!visible) return null;

  return (
    <div className="auth-banner" role="alert">
      <div className="auth-banner__content">
        <div className="auth-banner__title">Gmail needs reconnecting</div>
        <div className="auth-banner__text">
          Your Google session expired, so archive and label changes cannot be saved.
        </div>
      </div>
      <a className="auth-banner__button" href="/api/auth/start">
        Reconnect Google
      </a>
      <button className="auth-banner__dismiss" type="button" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
