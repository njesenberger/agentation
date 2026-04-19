import { useState, useEffect, useCallback, useRef } from "react";

export type TaskStatus = "running" | "done" | "error";

export type Task = {
  id: string;
  message: string;
  status: TaskStatus;
  summary: string;
};

export type SendContext = {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  theme: "dark" | "light";
  element?: { name: string; path: string };
};

export type ApiKeyState =
  | { configured: null }
  | { configured: true; provider: string | null }
  | { configured: false };

const REMOVE_DONE_MS = 2000;
const REMOVE_ERROR_MS = 6000;

/**
 * Open-channel command hook: every `send` creates a tracked task that streams
 * independently. Tasks auto-remove shortly after completion so the queue
 * doesn't grow unbounded while the user fires more commands.
 *
 * Accepts undefined endpoint/sessionId so callers can hoist the hook above
 * the `endpoint && sessionId` guard and still let React keep state stable.
 */
export function useCommandSend(
  endpoint: string | undefined,
  sessionId: string | undefined,
) {
  const [apiKey, setApiKey] = useState<ApiKeyState>({ configured: null });
  const [tasks, setTasks] = useState<Task[]>([]);
  // Most-recent-first ring of submitted commands. Bounded so an always-on
  // session doesn't grow unbounded. Used by the bubble for ↑/↓ recall and
  // for restoring command text on error.
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const abortersRef = useRef<Map<string, AbortController>>(new Map());
  const removeTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!endpoint) return;
    let cancelled = false;
    fetch(`${endpoint}/chat/api-key`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setApiKey(
          d.configured
            ? { configured: true, provider: d.provider ?? null }
            : { configured: false }
        );
      })
      .catch(() => {
        if (!cancelled) setApiKey({ configured: false });
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  useEffect(() => {
    // Abort any in-flight streams when the hook unmounts.
    const aborters = abortersRef.current;
    const timers = removeTimersRef.current;
    return () => {
      aborters.forEach((c) => c.abort());
      aborters.clear();
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  const scheduleRemove = useCallback(
    (id: string, after: number) => {
      const existing = removeTimersRef.current.get(id);
      if (existing !== undefined) window.clearTimeout(existing);
      const t = window.setTimeout(() => {
        setTasks((prev) => prev.filter((task) => task.id !== id));
        removeTimersRef.current.delete(id);
        abortersRef.current.delete(id);
      }, after);
      removeTimersRef.current.set(id, t);
    },
    []
  );

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }, []);

  const send = useCallback(
    (text: string, context: SendContext) => {
      if (!endpoint || !sessionId) return;
      const message = text.trim();
      if (!message) return;
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const controller = new AbortController();
      abortersRef.current.set(id, controller);
      setTasks((prev) => [
        ...prev,
        { id, message, status: "running", summary: "Working…" },
      ]);
      setCommandHistory((prev) => [message, ...prev].slice(0, 20));

      (async () => {
        try {
          const res = await fetch(`${endpoint}/chat/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              message,
              context,
              kind: "command",
            }),
            signal: controller.signal,
          });
          if (!res.body) throw new Error("No response stream");
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";
            for (const part of parts) {
              const line = part
                .split("\n")
                .find((l) => l.startsWith("data: "));
              if (!line) continue;
              try {
                const ev = JSON.parse(line.slice(6));
                if (ev.type === "tool_use" && typeof ev.name === "string") {
                  updateTask(id, { summary: `Running ${ev.name}…` });
                }
                if (
                  ev.type === "text_delta" &&
                  typeof ev.text === "string"
                ) {
                  updateTask(id, { summary: ev.text.slice(0, 80) });
                }
                if (ev.type === "error") {
                  updateTask(id, {
                    status: "error",
                    summary: ev.message ?? "Failed",
                  });
                  scheduleRemove(id, REMOVE_ERROR_MS);
                  return;
                }
              } catch {
                // ignore malformed
              }
            }
          }
          updateTask(id, { status: "done", summary: message });
          scheduleRemove(id, REMOVE_DONE_MS);
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") {
            setTasks((prev) => prev.filter((t) => t.id !== id));
            abortersRef.current.delete(id);
            return;
          }
          updateTask(id, {
            status: "error",
            summary: err instanceof Error ? err.message : "Failed",
          });
          scheduleRemove(id, REMOVE_ERROR_MS);
        }
      })();
    },
    [endpoint, sessionId, scheduleRemove, updateTask]
  );

  const dismissTask = useCallback((id: string) => {
    const ctrl = abortersRef.current.get(id);
    ctrl?.abort();
    abortersRef.current.delete(id);
    const timer = removeTimersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    removeTimersRef.current.delete(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { apiKey, tasks, commandHistory, send, dismissTask };
}
