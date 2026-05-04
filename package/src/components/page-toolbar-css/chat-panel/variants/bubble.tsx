import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import type { ApiKeyState, SendContext, Task } from "../use-command-send";
import styles from "./bubble.module.scss";

type BubbleProps = {
  isVisible: boolean;
  isDarkMode: boolean;
  capturedElement: { name: string; path: string } | null;
  onClose: () => void;
  onOpenSettings: () => void;
  apiKey: ApiKeyState;
  tasks: Task[];
  commandHistory: string[];
  send: (text: string, context: SendContext) => void;
  // Optional override called instead of `send` when set. Used by the parent
  // to handle element-scoped submits (annotation save + optional agent fire).
  onSubmit?: (text: string, context: SendContext) => void;
  /** When set, anchors the bubble to this position instead of the cursor. */
  markerPosition?: { x: number; y: number };
};

const CURSOR_OFFSET_X = 10;
const CURSOR_OFFSET_Y = 10;
const MARGIN = 8;
const APPROX_WIDTH = 220;
const APPROX_HEIGHT = 44;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function BubbleVariant({
  isVisible,
  isDarkMode,
  capturedElement,
  onClose,
  onOpenSettings,
  apiKey,
  tasks,
  commandHistory,
  send,
  onSubmit,
  markerPosition,
}: BubbleProps) {
  const [input, setInput] = useState("");
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [fakeCursor, setFakeCursor] = useState<{ x: number; y: number } | null>(
    null,
  );
  // History navigation state. `index === null` = not navigating; otherwise
  // 0..history.length-1 where 0 is the newest command. `draft` preserves
  // whatever the user was typing before they pressed ↑ for the first time.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState("");
  // Track the most recent submitted message so we can restore it into the
  // input if the resulting task errors and the user hasn't started typing
  // something new yet.
  const lastSentRef = useRef<string | null>(null);
  const handledErrorIdsRef = useRef<Set<string>>(new Set());
  const lastCursor = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const needsApiKey = apiKey.configured === false;

  const placeholder =
    needsApiKey && !onSubmit
      ? "Press ↵ to add an API key…"
      : capturedElement
        ? "What should change?"
        : "Global change…";

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastCursor.current = { x: e.clientX, y: e.clientY };
      setFakeCursor(null);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setAnchor(null);
      setInput("");
      setFakeCursor(null);
      setHistoryIndex(null);
      setHistoryDraft("");
      return;
    }
    // Element-scoped (placed via marker click): anchor to marker bottom-right,
    // don't follow the cursor.
    if (markerPosition) {
      const MARKER_SIZE = 22;
      const popupWidth = 220;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scrollY = window.scrollY;
      let x = markerPosition.x + MARKER_SIZE / 2;
      let y = markerPosition.y + MARKER_SIZE / 2; // document coords
      // Clamp so bubble doesn't overflow right edge
      if (x + popupWidth > vw - MARGIN)
        x = Math.max(MARGIN, vw - popupWidth - MARGIN);
      // Clamp using viewport coords for overflow check, but store as document coords
      if (y - scrollY + APPROX_HEIGHT > vh - MARGIN)
        y = Math.max(scrollY + MARGIN, scrollY + vh - APPROX_HEIGHT - MARGIN);
      setAnchor({ x, y });
      return;
    }
    // Global cursor bubble: anchor near cursor
    const { x, y } = lastCursor.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setAnchor({
      x: clamp(
        (x || vw / 2) + CURSOR_OFFSET_X,
        MARGIN,
        vw - APPROX_WIDTH - MARGIN,
      ),
      y: clamp(
        (y || vh / 2) + CURSOR_OFFSET_Y,
        MARGIN,
        vh - APPROX_HEIGHT - MARGIN,
      ),
    });
  }, [isVisible, markerPosition]);

  // Only follow the cursor when NOT anchored to a marker
  useEffect(() => {
    if (!isVisible || markerPosition) return;
    const onMove = (e: MouseEvent) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setAnchor({
        x: clamp(
          e.clientX + CURSOR_OFFSET_X,
          MARGIN,
          vw - APPROX_WIDTH - MARGIN,
        ),
        y: clamp(
          e.clientY + CURSOR_OFFSET_Y,
          MARGIN,
          vh - APPROX_HEIGHT - MARGIN,
        ),
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [isVisible, markerPosition]);

  // Focus the input whenever the bubble is visible — including in the
  // no-API-key state so the user can still press Enter to open Settings.
  useEffect(() => {
    if (!isVisible) return;
    if (apiKey.configured === null) return; // still checking
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [isVisible, apiKey.configured]);

  useEffect(() => {
    if (!isVisible) return;
    const input = inputRef.current;
    if (!input) return;
    const onBlur = () => {
      window.setTimeout(() => {
        if (inputRef.current && document.body.contains(inputRef.current)) {
          inputRef.current.focus();
        }
      }, 0);
    };
    input.addEventListener("blur", onBlur);
    return () => input.removeEventListener("blur", onBlur);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
        return;
      }
      const isTypingKey =
        e.key.length === 1 ||
        e.key === "Backspace" ||
        e.key === "Delete" ||
        e.key === "Tab";
      if (!isTypingKey) return;
      setFakeCursor({ x: lastCursor.current.x, y: lastCursor.current.y });
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKey, { capture: true });
  }, [isVisible, onClose]);

  // Any mousedown is treated as "the operator is moving on" — dismiss the
  // bubble. The bubble itself is pointer-events:none so clicks pass through
  // to the page anyway; we just need to catch the intent. Clicks on bubble
  // descendants with pointer-events:auto (running task pills) still reach
  // their own handlers first.
  useEffect(() => {
    if (!isVisible) return;
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isVisible, onClose]);

  // Restore the most recent submitted command into the input if it errored
  // and the user hasn't started typing something new. `handledErrorIdsRef`
  // avoids restoring more than once per task.
  useEffect(() => {
    if (!isVisible) return;
    for (const task of tasks) {
      if (task.status !== "error") continue;
      if (handledErrorIdsRef.current.has(task.id)) continue;
      handledErrorIdsRef.current.add(task.id);
      if (task.message !== lastSentRef.current) continue;
      setInput((prev) => (prev.length === 0 ? task.message : prev));
      lastSentRef.current = null;
    }
    // When a matching task completes successfully, drop the ref so we stop
    // considering that command's errors.
    for (const task of tasks) {
      if (task.status === "done" && task.message === lastSentRef.current) {
        lastSentRef.current = null;
      }
    }
  }, [isVisible, tasks]);

  const handleSubmit = useCallback(() => {
    const v = input.trim();
    if (!v) return;
    const context: SendContext = {
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      theme: isDarkMode ? "dark" : "light",
      ...(capturedElement ? { element: capturedElement } : {}),
    };
    lastSentRef.current = v;
    if (onSubmit) {
      // Element-scoped submit (annotation creation): the action is complete,
      // dismiss the bubble. Open-channel staying-open is reserved for the
      // global `/` command flow where send() is used directly.
      onSubmit(v, context);
      setInput("");
      setHistoryIndex(null);
      setHistoryDraft("");
      onClose();
      return;
    }
    send(v, context);
    setInput("");
    setHistoryIndex(null);
    setHistoryDraft("");
  }, [input, send, onSubmit, onClose, isDarkMode, capturedElement]);

  const navigateHistory = useCallback(
    (direction: "older" | "newer") => {
      if (commandHistory.length === 0) return;
      if (direction === "older") {
        setHistoryIndex((current) => {
          if (current === null) {
            setHistoryDraft(input);
            return 0;
          }
          return Math.min(current + 1, commandHistory.length - 1);
        });
      } else {
        setHistoryIndex((current) => {
          if (current === null) return null;
          if (current === 0) return null;
          return current - 1;
        });
      }
    },
    [commandHistory.length, input],
  );

  // Sync input with the currently navigated history entry (or the draft).
  useEffect(() => {
    if (historyIndex === null) return;
    const next = commandHistory[historyIndex];
    if (typeof next === "string") setInput(next);
  }, [historyIndex, commandHistory]);

  // Auto-size input width using a temporary mirror span
  useLayoutEffect(() => {
    const inp = inputRef.current;
    if (!inp) return;

    const measure = () => {
      const mirror = document.createElement("span");
      mirror.style.position = "absolute";
      mirror.style.top = "-9999px";
      mirror.style.left = "-9999px";
      mirror.style.visibility = "hidden";
      mirror.style.whiteSpace = "pre";
      mirror.style.pointerEvents = "none";
      document.body.appendChild(mirror);

      const cs = window.getComputedStyle(inp);
      mirror.style.font = cs.font;
      mirror.style.letterSpacing = cs.letterSpacing;
      mirror.textContent = input || placeholder;

      const paddingLeft = parseFloat(cs.paddingLeft);
      const paddingRight = parseFloat(cs.paddingRight);
      const w = Math.min(mirror.offsetWidth + paddingLeft + paddingRight, 200);
      inp.style.width = `${w}px`;

      document.body.removeChild(mirror);
    };

    measure();
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [input, placeholder, isVisible, anchor]);

  if (!anchor) return null;

  return (
    <>
      <div
        ref={rootRef}
        className={`${styles.bubble} ${!isDarkMode ? styles.light : ""} ${isVisible ? styles.enter : styles.exit}`}
        style={{
          left: anchor.x,
          top: anchor.y,
          position: markerPosition ? "absolute" : undefined,
        }}
        data-feedback-toolbar
      >
        <div className={styles.body}>
          {/* Element-scoped chip removed in v2 — the persistent element label
              and outline already communicate scope; the bubble stays minimal. */}
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={input}
            style={{ width: undefined, maxWidth: 200, minWidth: 0 }}
            placeholder={placeholder}
            onChange={(e) => {
              // Any user-driven change exits history navigation so subsequent
              // ↑/↓ restart from the new draft.
              if (historyIndex !== null) {
                setHistoryIndex(null);
                setHistoryDraft("");
              }
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                // When onSubmit is provided (element-scoped annotation), bypass API key
                // check entirely — we're just saving an annotation, not calling the agent.
                if (needsApiKey && !onSubmit) {
                  onOpenSettings();
                  return;
                }
                handleSubmit();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                if (historyIndex !== null) {
                  setHistoryIndex(null);
                  setInput(historyDraft);
                  setHistoryDraft("");
                  return;
                }
                onClose();
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                navigateHistory("older");
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                navigateHistory("newer");
                // Going below index 0 restores the draft.
                if (historyIndex === 0) setInput(historyDraft);
                return;
              }
            }}
          />
        </div>

        {tasks.length > 0 && (
          <div className={styles.taskList}>
            {tasks.map((task) => (
              <TaskPill
                key={task.id}
                task={task}
                // Click on a running pill dismisses the bubble — mirrors the
                // Esc shortcut. The task itself keeps running and will be
                // picked up by the toolbar activity label once the bubble
                // closes.
                onDismiss={
                  task.status === "running" ? () => onClose() : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
      {fakeCursor && (
        <svg
          className={styles.fakeCursor}
          style={{ left: fakeCursor.x - 1, top: fakeCursor.y - 1 }}
          width="16"
          height="21"
          viewBox="0 0 14 19"
          aria-hidden
        >
          <path
            d="M1 1 L1 15 L4.3 11.7 L6.4 17 L8.2 16.1 L6 10.5 L10 10.5 Z"
            fill="#000"
            stroke="#fff"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  );
}

function TaskPill({ task, onDismiss }: { task: Task; onDismiss?: () => void }) {
  const dotClass =
    task.status === "running"
      ? styles.dotRunning
      : task.status === "done"
        ? styles.dotDone
        : styles.dotError;

  return (
    <div
      className={`${styles.taskPill} ${task.status !== "running" ? styles.taskFading : ""} ${onDismiss ? styles.taskPillDismissable : ""}`}
      onClick={
        onDismiss
          ? (e) => {
              e.stopPropagation();
              onDismiss();
            }
          : undefined
      }
      role={onDismiss ? "button" : undefined}
      title={onDismiss ? "Click to dismiss (task keeps running)" : undefined}
    >
      <span className={`${styles.taskDot} ${dotClass}`} aria-hidden />
      <span className={styles.taskText}>{task.summary}</span>
      {onDismiss && (
        <span className={styles.taskCancel} aria-hidden>
          ×
        </span>
      )}
    </div>
  );
}
