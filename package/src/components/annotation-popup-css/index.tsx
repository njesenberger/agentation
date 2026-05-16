"use client";

import {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  forwardRef,
} from "react";
import styles from "./styles.module.scss";
import { IconTrash } from "../icons";
import { originalSetTimeout } from "../../utils/freeze-animations";

// =============================================================================
// Helpers
// =============================================================================

/** Focus an element while temporarily blocking focus-trap libraries (e.g. Radix
 *  FocusScope) from reclaiming focus via focusin/focusout handlers. */
function focusBypassingTraps(el: HTMLElement | null) {
  if (!el) return;
  const trap = (e: Event) => e.stopImmediatePropagation();
  document.addEventListener("focusin", trap, true);
  document.addEventListener("focusout", trap, true);
  try {
    el.focus();
  } finally {
    document.removeEventListener("focusin", trap, true);
    document.removeEventListener("focusout", trap, true);
  }
}

// =============================================================================
// Constants (mirror bubble.tsx)
// =============================================================================

const MARKER_SIZE = 22;
const POPUP_WIDTH = 220;
const MARGIN = 8;

// =============================================================================
// Types
// =============================================================================

type MarkerCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

type AnchorState = {
  x: number;
  y: number;
  flipsLeft: boolean;
  flipsUp: boolean;
};

export interface AnnotationPopupCSSProps {
  /** Element name to display in header */
  element: string;
  /** Optional timestamp display (e.g., "@ 1.23s" for animation feedback) */
  timestamp?: string;
  /** Optional selected/highlighted text */
  selectedText?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Initial value for input (for edit mode) */
  initialValue?: string;
  /** Label for submit button (default: "Add") */
  submitLabel?: string;
  /** Called when annotation is submitted with text */
  onSubmit: (text: string) => void;
  /** Called when annotation is submitted AND sent to agent (Cmd+Enter) */
  onSubmitToAgent?: (text: string) => void;
  /** Called when popup is cancelled/dismissed */
  onCancel: () => void;
  /** Called when delete button is clicked (only shown if provided) */
  onDelete?: () => void;
  /**
   * Marker position in document coordinates. When provided the component
   * manages its own position (bottom-right of marker by default, flipping as
   * needed) and ignores the `style` prop's left/top values.
   */
  markerPosition?: { x: number; y: number };
  /** Position styles — used for non-marker placement or additional overrides */
  style?: React.CSSProperties;
  /** Custom color for submit button and input focus (hex) */
  accentColor?: string;
  /** External exit state (parent controls exit animation) */
  isExiting?: boolean;
  /** Light mode styling */
  lightMode?: boolean;
  /** Computed styles for the selected element */
  computedStyles?: Record<string, string>;
}

// =============================================================================
// Component
// =============================================================================

export const AnnotationPopupCSS = forwardRef<
  HTMLDivElement,
  AnnotationPopupCSSProps
>(
  (
    {
      placeholder = "What should change?",
      initialValue = "",
      onSubmit,
      onSubmitToAgent,
      onCancel,
      onDelete,
      markerPosition,
      style,
      accentColor = "#3c82f7",
    },
    ref,
  ) => {
    const [text, setText] = useState(initialValue);
    const [isFocused, setIsFocused] = useState(false);
    const [anchor, setAnchor] = useState<AnchorState | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // -------------------------------------------------------------------------
    // Marker positioning — mirrors bubble.tsx useLayoutEffect exactly.
    // Recalculates on scroll/resize so the popup always flips correctly.
    // -------------------------------------------------------------------------
    useLayoutEffect(() => {
      if (!markerPosition) return;

      const reposition = () => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scrollY = window.scrollY;
        const popupHeight = popupRef.current?.offsetHeight ?? 44;

        // Prefer bottom; flip to top if not enough space below.
        const markerViewportY = markerPosition.y - scrollY;
        const defaultY = markerViewportY + MARKER_SIZE / 2;
        const flipsUp = defaultY + popupHeight > vh - MARGIN;
        const y = flipsUp
          ? markerViewportY - MARKER_SIZE / 2 - popupHeight
          : defaultY;

        // Prefer right; flip to left if not enough space on the right.
        const defaultX = markerPosition.x + MARKER_SIZE / 2;
        const popupWidth = popupRef.current?.offsetWidth ?? POPUP_WIDTH;
        const flipsLeft = defaultX + popupWidth > vw - MARGIN;
        const x = flipsLeft
          ? markerPosition.x - MARKER_SIZE / 2 - popupWidth
          : defaultX;

        setAnchor({ x, y, flipsLeft, flipsUp });
      };

      reposition();
      window.addEventListener("scroll", reposition, { passive: true });
      window.addEventListener("resize", reposition, { passive: true });
      return () => {
        window.removeEventListener("scroll", reposition);
        window.removeEventListener("resize", reposition);
      };
    }, [markerPosition]);

    // -------------------------------------------------------------------------
    // Auto-size input width using a temporary mirror span
    // -------------------------------------------------------------------------
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
        mirror.textContent = text || placeholder;

        const paddingLeft = parseFloat(cs.paddingLeft);
        const paddingRight = parseFloat(cs.paddingRight);
        const w = Math.min(
          mirror.offsetWidth + paddingLeft + paddingRight,
          200,
        );
        inp.style.width = `${w}px`;

        document.body.removeChild(mirror);
      };

      measure();
      const raf = requestAnimationFrame(measure);
      return () => cancelAnimationFrame(raf);
    }, [text, placeholder]);

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    const handleCancel = useCallback(() => {
      cancelTimerRef.current = originalSetTimeout(() => {
        onCancel();
      }, 150); // Match exit animation duration
    }, [onCancel]);

    const handleSubmit = useCallback(() => {
      if (!text.trim()) return;
      onSubmit(text.trim());
    }, [text, onSubmit]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmitToAgent) {
          e.preventDefault();
          if (!text.trim()) {
            onDelete?.();
            return;
          }
          onSubmitToAgent(text.trim());
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
        if (e.key === "Escape") {
          handleCancel();
        }
      },
      [handleSubmit, handleCancel, onSubmitToAgent, onDelete, text],
    );

    // -------------------------------------------------------------------------
    // Derived positioning styles + data-marker-corner attribute
    // -------------------------------------------------------------------------

    const anchorLabel: string | undefined = anchor
      ? `${anchor.flipsUp ? "top" : "bottom"}-${anchor.flipsLeft ? "left" : "right"}`
      : undefined;

    const markerCorner: MarkerCorner | undefined = anchorLabel as
      | MarkerCorner
      | undefined;

    const positionStyle: React.CSSProperties = anchor
      ? {
          position: "absolute",
          top: anchor.y,
          ...(anchor.flipsLeft
            ? {
                right:
                  window.innerWidth -
                  anchor.x -
                  (popupRef.current?.offsetWidth ?? POPUP_WIDTH),
              }
            : { left: anchor.x }),
        }
      : {};

    return (
      <div
        ref={(el) => {
          (popupRef as any).current = el;
          if (typeof ref === "function") {
            ref(el);
          } else if (ref) {
            (ref as any).current = el;
          }
        }}
        className={styles.wrapper}
        data-marker-corner={markerCorner}
        data-anchor={anchorLabel}
        style={{ ...positionStyle, ...style }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.container}>
          <button
            className={styles.removeButton}
            onClick={onDelete}
            type="button"
          >
            <IconTrash />
          </button>
          <input
            ref={inputRef}
            className={styles.input}
            style={{ borderColor: isFocused ? accentColor : undefined }}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
      </div>
    );
  },
);

export default AnnotationPopupCSS;
