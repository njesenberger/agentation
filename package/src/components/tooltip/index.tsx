import { ComponentPropsWithoutRef, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { originalSetTimeout } from "../../utils/freeze-animations";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipProps extends ComponentPropsWithoutRef<"span"> {
  tooltip: React.ReactNode;
  children: React.ReactNode;
  tooltipStyle?: React.CSSProperties;
  disabled?: boolean;
  placement?: TooltipPlacement;
  offset?: number;
}

const getPosition = (
  rect: DOMRect,
  placement: TooltipPlacement,
  offset: number,
): React.CSSProperties => {
  switch (placement) {
    case "top":
      return {
        top: rect.top - offset,
        left: rect.left + rect.width / 2,
        transform: "translate(-50%, -100%)",
      };
    case "bottom":
      return {
        top: rect.bottom + offset,
        left: rect.left + rect.width / 2,
        transform: "translate(-50%, 0)",
      };
    case "left":
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - offset,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        top: rect.top + rect.height / 2,
        left: rect.right + offset,
        transform: "translate(0, -50%)",
      };
  }
};

let lastTooltipHideTime = 0;

export const Tooltip = ({
  tooltip,
  children,
  tooltipStyle,
  disabled,
  placement = "left",
  offset = 8,
  ...props
}: TooltipProps) => {
  const [visible, setVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof originalSetTimeout> | null>(null);
  const exitTimeoutRef = useRef<ReturnType<typeof originalSetTimeout> | null>(
    null,
  );
  const isHoveredRef = useRef(false);
  const portalThemeRef = useRef<{ theme: string; accent: string } | null>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPositionStyle(getPosition(rect, placement, offset));

      const themeEl = triggerRef.current.closest("[data-agentation-theme]");
      portalThemeRef.current = themeEl
        ? {
            theme: themeEl.getAttribute("data-agentation-theme") ?? "",
            accent: themeEl.getAttribute("data-agentation-accent") ?? "",
          }
        : null;
    }
  };

  const handleMouseEnter = () => {
    isHoveredRef.current = true;
    if (disabled) return;
    setShouldRender(true);
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
    updatePosition();
    const delay = Date.now() - lastTooltipHideTime < 300 ? 0 : 500;
    timeoutRef.current = originalSetTimeout(() => {
      setVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (visible) {
      lastTooltipHideTime = Date.now();
    }
    setVisible(false);
    exitTimeoutRef.current = originalSetTimeout(() => {
      setShouldRender(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setVisible(false);
      exitTimeoutRef.current = originalSetTimeout(() => {
        setShouldRender(false);
        lastTooltipHideTime = Date.now();
      }, 150);
    } else if (isHoveredRef.current) {
      setShouldRender(true);
      updatePosition();
      const delay = Date.now() - lastTooltipHideTime < 300 ? 0 : 500;
      timeoutRef.current = originalSetTimeout(() => {
        setVisible(true);
      }, delay);
    }
  }, [disabled]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {children}
      </span>
      {shouldRender &&
        createPortal(
          <div
            data-feedback-toolbar
            data-agentation-theme={portalThemeRef.current?.theme}
            data-agentation-accent={portalThemeRef.current?.accent}
            style={{
              position: "fixed",
              zIndex: 2147483647,
              opacity: visible ? 1 : 0,
              transition: "transform 0.15s, opacity 0.15s",
              ...positionStyle,
              ...tooltipStyle,
            }}
          >
            {tooltip}
          </div>,
          document.body,
        )}
    </>
  );
};
