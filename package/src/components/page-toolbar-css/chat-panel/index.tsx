import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { originalSetTimeout } from "../../../utils/freeze-animations";
import { IconSendArrow, IconTrashAlt } from "../../icons";
import styles from "./styles.module.scss";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolActions?: { name: string; status: "running" | "done"; summary?: string }[];
};

type ChatStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "message_break" }
  | { type: "complete" }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolAction = { name: string; status: "running" | "done"; summary?: string };

/** Collapse consecutive completed tools with the same name into one badge with a count. */
function collapseToolActions(
  actions: ToolAction[]
): (ToolAction & { count: number })[] {
  const result: (ToolAction & { count: number })[] = [];
  for (const action of actions) {
    const last = result[result.length - 1];
    if (
      last &&
      last.name === action.name &&
      last.status === "done" &&
      action.status === "done"
    ) {
      last.count++;
    } else {
      result.push({ ...action, count: 1 });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type ChatPanelProps = {
  endpoint: string;
  sessionId: string;
  isVisible: boolean;
  toolbarNearBottom: boolean;
  isDarkMode: boolean;
};

export type ChatPanelHandle = {
  sendMessage: (text: string) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel({
  endpoint,
  sessionId,
  isVisible,
  toolbarNearBottom,
  isDarkMode,
}: ChatPanelProps, ref) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check API key status on mount
  useEffect(() => {
    fetch(`${endpoint}/chat/api-key`)
      .then((r) => r.json())
      .then((d) => {
        setApiKeyConfigured(d.configured);
        setProviderName(d.provider);
      })
      .catch(() => setApiKeyConfigured(false));
  }, [endpoint]);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isVisible && apiKeyConfigured) {
      originalSetTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isVisible, apiKeyConfigured]);

  // Save API key
  const saveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return;
    setApiKeySaving(true);
    try {
      const res = await fetch(`${endpoint}/chat/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setApiKeyConfigured(true);
        setProviderName(data.provider);
        setApiKeyInput("");
      } else {
        setApiKeyInput("");
      }
    } catch {
      // Silently fail
    }
    setApiKeySaving(false);
  }, [endpoint, apiKeyInput]);

  // Send message — optionally pass text directly for action buttons
  const sendMessage = useCallback(async (directText?: string) => {
    const text = (directText || input).trim();
    if (!text || isStreaming) return;

    const userMsg: DisplayMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };

    let assistantId = `a-${Date.now()}`;
    const assistantMsg: DisplayMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    // Auto-resize textarea back to minimum
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const response = await fetch(`${endpoint}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          let data = "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              data = line.slice(6);
            }
          }
          if (!data) continue;

          try {
            const event: ChatStreamEvent = JSON.parse(data);

            if (event.type === "text_delta") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              );
            }

            if (event.type === "tool_use") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolActions: [
                          ...(m.toolActions || []),
                          { name: event.name, status: "running" as const },
                        ],
                      }
                    : m
                )
              );
            }

            if (event.type === "tool_result") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  // Find the first matching running tool and mark it done
                  let matched = false;
                  return {
                    ...m,
                    toolActions: m.toolActions?.map((a) => {
                      if (!matched && a.name === event.name && a.status === "running") {
                        matched = true;
                        return { ...a, status: "done" as const, summary: event.result };
                      }
                      return a;
                    }),
                  };
                })
              );
            }

            if (event.type === "message_break") {
              // End current message and start a new one
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m
                )
              );
              assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
              setMessages((prev) => [
                ...prev,
                { id: assistantId, role: "assistant", content: "", isStreaming: true },
              ]);
            }

            if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content || event.message, isStreaming: false }
                    : m
                )
              );
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Connection failed";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || errorMsg, isStreaming: false }
            : m
        )
      );
    }

    // Mark streaming complete
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId ? { ...m, isStreaming: false } : m
      )
    );
    setIsStreaming(false);
  }, [input, isStreaming, endpoint, sessionId]);

  // Expose sendMessage to parent via ref
  useImperativeHandle(ref, () => ({ sendMessage }), [sendMessage]);

  // Clear chat
  const clearChat = useCallback(async () => {
    setMessages([]);
    try {
      await fetch(`${endpoint}/chat/history/${sessionId}`, { method: "DELETE" });
    } catch {
      // Best effort
    }
  }, [endpoint, sessionId]);

  // Handle textarea auto-resize
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      e.target.style.height = "auto";
      e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
    },
    []
  );

  // Handle key events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation(); // Prevent toolbar shortcuts
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const providerLabel =
    providerName === "anthropic" ? "Claude" : providerName === "openai" ? "GPT" : null;

  return (
    <div
      className={`${styles.chatPanel} ${!isDarkMode ? styles.light : ""} ${isVisible ? styles.enter : styles.exit}`}
      style={
        toolbarNearBottom
          ? { bottom: "auto", top: "calc(100% + 0.5rem)" }
          : undefined
      }
      data-feedback-toolbar
      onClick={(e) => e.stopPropagation()}
    >
      {/* API Key Setup Screen */}
      {apiKeyConfigured === false && (
        <div className={styles.apiKeyScreen}>
          <div className={styles.apiKeyTitle}>Connect AI</div>
          <div className={styles.apiKeyDescription}>
            Add your API key to chat with an AI assistant directly from the
            toolbar.
          </div>
          <input
            type="password"
            className={styles.apiKeyInput}
            placeholder="sk-ant-... or sk-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") saveApiKey();
            }}
          />
          <button
            className={styles.apiKeySave}
            onClick={saveApiKey}
            disabled={!apiKeyInput.trim() || apiKeySaving}
          >
            {apiKeySaving ? "Saving..." : "Save"}
          </button>
          <a
            className={styles.apiKeyLink}
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get an API key
          </a>
        </div>
      )}

      {/* Loading state */}
      {apiKeyConfigured === null && (
        <div className={styles.emptyState}>Connecting...</div>
      )}

      {/* Chat UI */}
      {apiKeyConfigured === true && (
        <>
          <div className={styles.header}>
            <span className={styles.headerTitle}>
              Chat
              {providerLabel && (
                <span className={styles.providerBadge}>{providerLabel}</span>
              )}
            </span>
            {messages.length > 0 && (
              <button
                className={styles.clearButton}
                onClick={clearChat}
                title="Clear chat"
              >
                <IconTrashAlt size={14} />
              </button>
            )}
          </div>

          <div className={styles.messages}>
            {messages.length === 0 && (
              <div className={styles.promptSuggestions}>
                <button
                  className={styles.actionButton}
                  onClick={() => { sendMessage("Fix all pending annotations"); }}
                  disabled={isStreaming}
                >
                  <span className={styles.actionIcon}>&#9889;</span>
                  <span>
                    <span className={styles.actionLabel}>Fix annotations</span>
                    <span className={styles.actionDesc}>Resolve all pending feedback</span>
                  </span>
                </button>

                <div className={styles.promptDivider}>
                  <span>or ask</span>
                </div>

                {[
                  "What needs to change on this page?",
                  "Improve the copy",
                  "Make spacing more consistent",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    className={styles.promptChip}
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {messages.map((msg, idx) => {
              const hasContent = msg.content.trim().length > 0;
              const hasTools = msg.toolActions && msg.toolActions.length > 0;
              const isLast = idx === messages.length - 1;
              const isEmpty = !hasContent && !hasTools;

              // Skip empty assistant messages unless it's the last one (show dots)
              if (msg.role === "assistant" && isEmpty && !isLast) return null;

              return (
                <div key={msg.id}>
                  {/* Text content */}
                  {(hasContent || (isEmpty && isLast && msg.isStreaming)) && (
                    <div
                      className={`${styles.message} ${
                        msg.role === "user"
                          ? styles.messageUser
                          : styles.messageAssistant
                      }`}
                    >
                      {msg.content}
                      {msg.isStreaming && !hasContent && (
                        <span className={styles.streamingDots}>
                          <span />
                          <span />
                          <span />
                        </span>
                      )}
                    </div>
                  )}

                  {/* Tool badges — compact row below message */}
                  {hasTools && (
                    <div className={styles.toolRow}>
                      {collapseToolActions(msg.toolActions!).map((action, i) => (
                        <span
                          key={i}
                          className={`${styles.toolBadge} ${
                            action.status === "running" ? styles.running : ""
                          }`}
                        >
                          {action.status === "running"
                            ? `${action.name}...`
                            : `${action.name}${action.count > 1 ? ` ×${action.count}` : ""} ✓`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputArea}>
            <textarea
              ref={inputRef}
              className={styles.input}
              placeholder="Type a message..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isStreaming}
            />
            <button
              className={styles.sendButton}
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              title="Send"
            >
              <IconSendArrow size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
});
