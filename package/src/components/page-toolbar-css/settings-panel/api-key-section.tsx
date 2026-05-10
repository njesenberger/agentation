import { useCallback, useEffect, useState } from "react";
import { HelpTooltip } from "../../help-tooltip";
import { Switch } from "../../switch";
import styles from "./styles.module.scss";

type ApiKeyState =
  | { configured: null }
  | { configured: true; provider: string | null }
  | { configured: false };

type Props = {
  endpoint: string;
  agentMode: boolean;
  onAgentModeChange: (enabled: boolean) => void;
};

export function ApiKeySection({
  endpoint,
  agentMode,
  onAgentModeChange,
}: Props) {
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
            : { configured: false },
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
    try {
      const res = await fetch(`${endpoint}/chat/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: input.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setState({ configured: true, provider: data.provider ?? null });
        setInput("");
        setEditing(false);
        setError(null);
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

  const showInput = editing;

  return (
    <div className={styles.settingsSection}>
      {/* Header row: title + provider pill + toggle */}
      <div className={styles.settingsRow}>
        <span className={styles.automationHeader}>
          Agent Mode
          {state.configured === true && providerLabel && (
            <span
              className={styles.apiKeyBadge}
              title="Provider detected from key"
            >
              {providerLabel}
            </span>
          )}
        </span>
        <div className={styles.autoSendContainer}>
          <Switch
            id="agentation-agent-mode"
            checked={agentMode}
            onChange={(e) => onAgentModeChange(e.target.checked)}
            disabled={state.configured !== true}
          />
        </div>
      </div>

      {/* Description + key action link */}
      <p className={styles.automationDescription} style={{ paddingBottom: 6 }}>
        Agent mode allows an agent to directly act on annotations.{" "}
        {state.configured === null ? (
          <span>Checking…</span>
        ) : (
          <button
            type="button"
            className={styles.learnMoreLink}
            onClick={() => {
              if (editing) {
                setEditing(false);
                setInput("");
                setError(null);
              } else {
                setEditing(true);
                setError(null);
              }
            }}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {editing
              ? "Cancel"
              : state.configured === false
                ? "Add API key"
                : "Edit API key"}
          </button>
        )}
      </p>
      <div
        className={`${styles.apiKeyInputRowWrapper} ${showInput ? styles.visible : ""}`}
      >
        <div style={{ minHeight: 0 }}>
          <div className={styles.apiKeyInputRow}>
            <input
              type="password"
              className={styles.apiKeyInput}
              placeholder="Enter API key…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                  setInput("");
                  setError(null);
                }
              }}
              disabled={saving}
              autoFocus
            />
            <button
              type="button"
              className={styles.apiKeySaveButton}
              onClick={() => void save()}
              disabled={!input.trim() || saving}
            >
              Save
            </button>
          </div>
          {error && <p className={styles.apiKeyError}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
