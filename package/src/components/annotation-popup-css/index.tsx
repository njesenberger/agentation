"use client";

import { useState, useRef, useCallback } from "react";
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
// Types
// =============================================================================

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
  /** Position styles (left, top) */
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

export const AnnotationPopupCSS = ({
  placeholder = "What should change?",
  initialValue = "",
  onSubmit,
  onSubmitToAgent,
  onCancel,
  onDelete,
  style,
  accentColor = "#3c82f7",
}: AnnotationPopupCSSProps) => {
  const [text, setText] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle cancel with exit animation
  const handleCancel = useCallback(() => {
    cancelTimerRef.current = originalSetTimeout(() => {
      onCancel();
    }, 150); // Match exit animation duration
  }, [onCancel]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (!text.trim()) return;
    onSubmit(text.trim());
  }, [text, onSubmit]);

  // Handle keyboard
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
    [handleSubmit, handleCancel, onSubmitToAgent, text],
  );

  return (
    <div
      className={styles.wrapper}
      style={style}
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
};

export default AnnotationPopupCSS;
