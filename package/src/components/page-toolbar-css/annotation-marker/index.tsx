import { useState, useRef, useLayoutEffect } from "react";
import { Annotation } from "../../../types";
import { IconCheck, IconEdit, IconPlus, IconXmark } from "../../icons";
import styles from "./styles.module.scss";

export type AnnotationMarkerAgentStatus = "running" | "done";

type MarkerClickBehavior = "edit" | "delete";

// =============================================================================
// AnnotationMarker
// =============================================================================

type AnnotationMarkerProps = {
  annotation: Annotation;
  globalIndex: number;
  /** Display index within this layer (for staggered animation delays) */
  layerIndex: number;
  layerSize: number;
  isExiting: boolean;
  isClearing: boolean;
  isAnimated: boolean;
  isHovered: boolean;
  isDeleting: boolean;
  isEditingAny: boolean;
  renumberFrom: number | null;
  markerClickBehavior: MarkerClickBehavior;
  agentStatus?: AnnotationMarkerAgentStatus;
  onHoverEnter: (annotation: Annotation) => void;
  onHoverLeave: () => void;
  onClick: (annotation: Annotation) => void;
  onContextMenu?: (annotation: Annotation) => void;
};

export function AnnotationMarker({
  annotation,
  globalIndex,
  layerIndex,
  layerSize,
  isExiting,
  isClearing,
  isAnimated,
  isHovered,
  isDeleting,
  isEditingAny,
  renumberFrom,
  markerClickBehavior,
  agentStatus,
  onHoverEnter,
  onHoverLeave,
  onClick,
  onContextMenu,
}: AnnotationMarkerProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [flipsUp, setFlipsUp] = useState(false);
  const [flipsLeft, setFlipsLeft] = useState(false);

  useLayoutEffect(() => {
    if (!isHovered) return;

    const reposition = () => {
      const el = tooltipRef.current;
      if (!el) return;

      const markerX = (annotation.x / 100) * window.innerWidth;
      const tooltipWidth = el.offsetWidth;
      const tooltipHeight = el.offsetHeight;

      setFlipsLeft(markerX + tooltipWidth > window.innerWidth - 8);
      setFlipsUp(
        (annotation.y as number) - window.scrollY + tooltipHeight >
          window.innerHeight - 8,
      );
    };

    const raf = requestAnimationFrame(reposition);
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
    };
  }, [isHovered, annotation.x, annotation.y]);

  const tooltipAnchorLabel = `${flipsUp ? "top" : "bottom"}-${flipsLeft ? "left" : "right"}`;

  const showDeleteState = (isHovered || isDeleting) && !isEditingAny;
  const showDeleteHover = showDeleteState && markerClickBehavior === "delete";
  const isMulti = annotation.isMultiSelect;

  const markerColor = isMulti
    ? "var(--agentation-color-green)"
    : "var(--agentation-color-accent)";

  const animClass = isExiting
    ? styles.exit
    : isClearing
      ? styles.clearing
      : !isAnimated
        ? styles.enter
        : "";

  const animationDelay = isExiting
    ? `${(layerSize - 1 - layerIndex) * 20}ms`
    : `${layerIndex * 20}ms`;

  return (
    <div
      className={`${styles.marker} ${isMulti ? styles.multiSelect : ""} ${animClass} ${showDeleteHover ? styles.hovered : ""}`}
      data-annotation-marker
      style={{
        left: `${annotation.x}%`,
        top: annotation.y,
        backgroundColor: showDeleteHover ? undefined : markerColor,
        animationDelay,
      }}
      onMouseEnter={() => onHoverEnter(annotation)}
      onMouseLeave={onHoverLeave}
      onClick={(e) => {
        e.stopPropagation();
        if (!isExiting) onClick(annotation);
      }}
      onContextMenu={
        onContextMenu
          ? (e) => {
              if (markerClickBehavior === "delete") {
                e.preventDefault();
                e.stopPropagation();
                if (!isExiting) onContextMenu(annotation);
              }
            }
          : undefined
      }
    >
      {agentStatus === "running" ? (
        <span className={styles.agentSpinner} aria-hidden />
      ) : agentStatus === "done" ? (
        <IconCheck size={14} />
      ) : showDeleteState ? (
        showDeleteHover ? (
          <IconXmark size={isMulti ? 18 : 16} />
        ) : (
          <IconEdit size={16} />
        )
      ) : (
        <span
          className={
            renumberFrom !== null && globalIndex >= renumberFrom
              ? styles.renumber
              : undefined
          }
        >
          {globalIndex + 1}
        </span>
      )}

      {isHovered && !isEditingAny && (
        <div
          ref={tooltipRef}
          className={`${styles.markerTooltip} ${styles.enter}`}
          data-anchor={tooltipAnchorLabel}
        >
          {annotation.comment}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PendingMarker
// =============================================================================

type PendingMarkerProps = {
  x: number;
  y: number;
  isMultiSelect?: boolean;
  isExiting: boolean;
};

export function PendingMarker({
  x,
  y,
  isMultiSelect,
  isExiting,
}: PendingMarkerProps) {
  return (
    <div
      className={`${styles.marker} ${styles.pending} ${isMultiSelect ? styles.multiSelect : ""} ${isExiting ? styles.exit : styles.enter}`}
      style={{
        left: `${x}%`,
        top: y,
        backgroundColor: isMultiSelect
          ? "var(--agentation-color-green)"
          : "var(--agentation-color-accent)",
      }}
    >
      <IconPlus size={12} />
    </div>
  );
}

// =============================================================================
// ExitingMarker
// =============================================================================

type ExitingMarkerProps = {
  annotation: Annotation;
  fixed?: boolean;
};

export function ExitingMarker({ annotation, fixed }: ExitingMarkerProps) {
  const isMulti = annotation.isMultiSelect;
  return (
    <div
      className={`${styles.marker} ${fixed ? styles.fixed : ""} ${styles.hovered} ${isMulti ? styles.multiSelect : ""} ${styles.exit}`}
      data-annotation-marker
      style={{
        left: `${annotation.x}%`,
        top: annotation.y,
      }}
    >
      <IconXmark size={isMulti ? 12 : 10} />
    </div>
  );
}
