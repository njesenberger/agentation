import { useCallback, useEffect, useState } from "react";
import { HelpTooltip } from "../../help-tooltip";
import styles from "./styles.module.scss";

type ApiKeyState =
  | { configured: null }
  | { configured: true; provider: string | null }
  | { configured: false };

type Props = {
  endpoint: string;
};

export function ApiKeySection({ endpoint }: Props) {
  const [state, setState] = useState<ApiKeyState>({ configured: null });
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${endpoint}/chat/api-key`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setState(
          d.configured
            ? { configured: true, provider: d.provider ?? null }
            : { configured: false }
        );
      })
      .catch(() => {
        if (!cancelled) setState({ configured: false });
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const save = useCallback(async () => {
    if (!input.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}/chat/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: input.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setState({
          configured: true,
          provider: data.provider ?? null,
        });
        setInput("");
        setEditing(false);
      } else {
        setError(data.error || "Couldn't save that key.");
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setSaving(false);
    }
  }, [endpoint, input]);

  const providerLabel =
    state.configured === true && state.provider === "anthropic"
      ? "Claude"
      : state.configured === true && state.provider === "openai"
        ? "GPT"
        : null;

  const showInput = state.configured === false || editing;

  return (
    <div className={styles.settingsSection}>
      <div className={styles.settingsRow}>
        <span className={styles.automationHeader}>
          AI API Key
          <HelpTooltip content="Used for the cursor-bubble command (/) to send code edits to an AI agent." />
        </span>
        {state.configured === true && providerLabel && (
          <span className={styles.apiKeyBadge} title="Provider detected from key">
            {providerLabel}
          </span>
        )}
      </div>

      {state.configured === true && !editing && (
        <p
          className={styles.automationDescription}
          style={{ paddingBottom: 6 }}
        >
          Connected. Bubble commands will route through this key.{" "}
          <button
            type="button"
            className={styles.learnMoreLink}
            onClick={() => setEditing(true)}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Replace key
          </button>
        </p>
      )}

      {state.configured === null && (
        <p className={styles.automationDescription} style={{ paddingBottom: 6 }}>
          Checking…
        </p>
      )}

      {showInput && (
        <>
          <p className={styles.automationDescription}>
            Paste an Anthropic or OpenAI key to enable the cursor-bubble
            commands.{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.learnMoreLink}
            >
              Get an Anthropic key
            </a>
          </p>
          <input
            type="password"
            className={styles.webhookUrlInput}
            style={{ minHeight: 36, fontFamily: "monospace" }}
            placeholder="sk-ant-… or sk-…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
              if (e.key === "Escape" && editing) {
                e.preventDefault();
                setEditing(false);
                setInput("");
                setError(null);
              }
            }}
            disabled={saving}
          />
          <div className={styles.apiKeyActions}>
            <button
              type="button"
              className={styles.apiKeySaveButton}
              onClick={() => void save()}
              disabled={!input.trim() || saving}
            >
              {saving ? "Saving…" : "Save key"}
            </button>
            {editing && (
              <button
                type="button"
                className={styles.apiKeyCancelButton}
                onClick={() => {
                  setEditing(false);
                  setInput("");
                  setError(null);
                }}
                disabled={saving}
              >
                Cancel
              </button>
            )}
          </div>
          {error && <p className={styles.apiKeyError}>{error}</p>}
        </>
      )}
    </div>
  );
}
