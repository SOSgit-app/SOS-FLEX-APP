import React, { useEffect, useMemo, useState } from 'react';

const FLASK_URL = 'http://127.0.0.1:5000/';

export function App() {
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const statusText = useMemo(() => {
    if (ready) return 'Ready';
    if (attempt <= 1) return 'Starting local scheduler…';
    return `Starting local scheduler… (attempt ${attempt})`;
  }, [ready, attempt]);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;

    async function ping() {
      try {
        // Prefer a fast "GET /" — even if CORS blocks access, a network-level success means it's up.
        // In Electron this should work reliably for localhost.
        await fetch(FLASK_URL, { cache: 'no-store' });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) {
          setAttempt((x) => x + 1);
          setTimeout(ping, 500);
        }
      }
    }

    ping();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          <div style={styles.title}>SOS FLEX Scheduler</div>
          <div style={styles.sub}>{statusText}</div>
          <div style={styles.hint}>
            If this stays here, the local backend isn’t starting.
          </div>
        </div>
      </div>
    );
  }

  // Avoid <webview> (can render blank under sandbox / policy settings).
  // Once backend is ready, just navigate the main window to it.
  window.location.replace(FLASK_URL);
  return null;
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f1f3f',
    color: 'white',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"'
  },
  card: {
    width: 520,
    maxWidth: '90vw',
    padding: 24,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)'
  },
  title: { fontSize: 18, fontWeight: 700, letterSpacing: 0.2 },
  sub: { marginTop: 10, fontSize: 14, opacity: 0.95 },
  hint: { marginTop: 10, fontSize: 12, opacity: 0.75, lineHeight: 1.4 }
};

