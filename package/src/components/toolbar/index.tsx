import { useRef, useState } from "react";
import {
  IconEyeAnimated,
  IconGear,
  IconLayout,
  IconListSparkle,
  IconPausePlayAnimated,
  IconSendArrow,
  IconTrashAlt,
  IconXmarkLarge,
} from "../icons";
import styles from "./styles.module.scss";
import { PulseDot } from "../pulse-dot";
import { Tooltip } from "../tooltip";

interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badgeCount: number;
  animationsPaused: boolean;
  onToggleAnimations: () => void;
  layoutModeActive: boolean;
  onToggleLayoutMode: () => void;
  markersVisible: boolean;
  onToggleMarkers: () => void;
  onCopy: () => Promise<void>;
  sendFeedbackVisible: boolean;
  onSendFeedback: () => Promise<void>;
  onClear: () => void;
  settingsVisible: boolean;
  onToggleSettings: () => void;
  mcpConnected: boolean;
}

export const Toolbar = ({
  className = "",
  children,
  open,
  onOpenChange,
  badgeCount,
  animationsPaused,
  onToggleAnimations,
  layoutModeActive,
  onToggleLayoutMode,
  markersVisible,
  onToggleMarkers,
  onCopy,
  sendFeedbackVisible,
  onSendFeedback,
  onClear,
  settingsVisible,
  onToggleSettings,
  mcpConnected,
  ...props
}: ToolbarProps) => {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [sendState, setSendState] = useState<"idle" | "success" | "error">(
    "idle",
  );

  const previousBadgeCount = useRef(badgeCount);

  if (badgeCount) {
    previousBadgeCount.current = badgeCount;
  }

  const tooltipsDisabled = layoutModeActive || settingsVisible;

  return (
    <div
      className={`${styles.toolbarWrapper} ${open ? styles.open : ""} ${className}`}
      {...props}
    >
      {children}
      <div
        className={`${styles.toolbarBadge} ${!badgeCount || open ? styles.hidden : ""}`}
      >
        {previousBadgeCount.current}
      </div>
      <div className={styles.toolbar}>
        <button
          className={styles.toolbarMenuButton}
          onClick={() => onOpenChange(true)}
          type="button"
        >
          <IconListSparkle className={styles.toolbarMenuButtonIcon} />
        </button>
        <div className={styles.toolbarButtonsContainer}>
          <Tooltip
            tooltip={
              <TooltipContent
                title={`${animationsPaused ? "Resume" : "Pause"}`}
                shortcut="P"
              />
            }
            placement="top"
            offset={12}
            disabled={tooltipsDisabled}
          >
            <button
              className={`${styles.toolbarButton} ${animationsPaused ? styles.enabled : ""}`}
              onClick={onToggleAnimations}
              type="button"
            >
              <IconPausePlayAnimated isPaused={animationsPaused} size={24} />
            </button>
          </Tooltip>
          <Tooltip
            tooltip={<TooltipContent title="Layout mode" shortcut="L" />}
            placement="top"
            offset={12}
            disabled={tooltipsDisabled}
          >
            <button
              className={`${styles.toolbarButton} ${layoutModeActive ? styles.enabled : ""}`}
              onClick={onToggleLayoutMode}
              type="button"
            >
              <IconLayout size={24} />
            </button>
          </Tooltip>
          <Tooltip
            tooltip={
              <TooltipContent
                title={markersVisible ? "Hide" : "Show"}
                shortcut="H"
              />
            }
            placement="top"
            offset={12}
            disabled={tooltipsDisabled || !badgeCount}
          >
            <button
              className={styles.toolbarButton}
              onClick={onToggleMarkers}
              type="button"
              disabled={!badgeCount || layoutModeActive}
            >
              <IconEyeAnimated isOpen={markersVisible} size={24} />
            </button>
          </Tooltip>
          <Tooltip
            tooltip={<TooltipContent title="Copy feedback" shortcut="C" />}
            disabled={tooltipsDisabled || !badgeCount}
            placement="top"
            offset={12}
          >
            <button
              className={`${styles.toolbarButton} ${copyState !== "idle" ? styles.feedback : ""}`}
              onClick={async () => {
                try {
                  await onCopy();
                  setCopyState("success");
                } catch {
                  setCopyState("error");
                } finally {
                  setTimeout(() => setCopyState("idle"), 2000);
                }
              }}
              type="button"
              disabled={!badgeCount}
            >
              <svg
                className={`${styles.toolbarButtonIcon} ${copyState !== "idle" ? styles.hidden : ""}`}
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
              >
                <rect
                  x="4.75"
                  y="9.75"
                  rx="1.5"
                  width="9.5"
                  height="9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M17.25 14.25H17.75C18.58 14.25 19.25 13.58 19.25 12.75V6.25C19.25 5.42 18.58 4.75 17.75 4.75H11.25C10.42 4.75 9.75 5.42157 9.75 6.25V6.75"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <svg
                className={`${styles.toolbarButtonIcon} ${copyState !== "success" ? styles.hidden : ""}`}
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                  stroke="var(--agentation-color-green)"
                  strokeWidth="1.5"
                />
                <path
                  d="M15 10L11 14.25L9.25 12.25"
                  stroke="var(--agentation-color-green)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <svg
                className={`${styles.toolbarButtonIcon} ${copyState !== "error" ? styles.hidden : ""}`}
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                  stroke="var(--agentation-color-red)"
                  strokeWidth="1.5"
                />
                <path
                  d="M12 8V12"
                  stroke="var(--agentation-color-red)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="12"
                  cy="15"
                  r="0.75"
                  fill="var(--agentation-color-red)"
                />
              </svg>
            </button>
          </Tooltip>
          <Tooltip
            tooltip={<TooltipContent title="Send annotation" shortcut="S" />}
            disabled={tooltipsDisabled || !sendFeedbackVisible || !badgeCount}
            placement="top"
            offset={12}
          >
            <button
              className={`${styles.toolbarButton} ${sendState !== "idle" ? styles.feedback : ""} ${!sendFeedbackVisible ? styles.hidden : ""}`}
              onClick={async () => {
                try {
                  await onSendFeedback();
                  setSendState("success");
                } catch {
                  setSendState("error");
                } finally {
                  setTimeout(() => setSendState("idle"), 2000);
                }
              }}
              type="button"
              disabled={!sendFeedbackVisible || !badgeCount}
            >
              <span
                className={`${styles.toolbarButtonIcon} ${sendState !== "idle" ? styles.hidden : ""}`}
              >
                <IconSendArrow size={24} state="idle" />
                <span
                  className={`${styles.toolbarButtonBadge} ${!badgeCount ? styles.hidden : ""}`}
                >
                  {previousBadgeCount.current}
                </span>
              </span>
              <svg
                className={`${styles.toolbarButtonIcon} ${sendState !== "success" ? styles.hidden : ""}`}
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                  stroke="var(--agentation-color-green)"
                  strokeWidth="1.5"
                />
                <path
                  d="M15 10L11 14.25L9.25 12.25"
                  stroke="var(--agentation-color-green)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <svg
                className={`${styles.toolbarButtonIcon} ${sendState !== "error" ? styles.hidden : ""}`}
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                  stroke="var(--agentation-color-red)"
                  strokeWidth="1.5"
                />
                <path
                  d="M12 8V12"
                  stroke="var(--agentation-color-red)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="12"
                  cy="15"
                  r="0.75"
                  fill="var(--agentation-color-red)"
                />
              </svg>
            </button>
          </Tooltip>
          <Tooltip
            tooltip={<TooltipContent title="Clear All" shortcut="X" />}
            disabled={tooltipsDisabled || !badgeCount}
            placement="top"
            offset={12}
          >
            <button
              className={styles.toolbarButton}
              onClick={onClear}
              type="button"
              disabled={!badgeCount}
            >
              <IconTrashAlt size={24} />
            </button>
          </Tooltip>
          <Tooltip
            tooltip={<TooltipContent title="Settings" />}
            placement="top"
            offset={12}
            disabled={tooltipsDisabled}
          >
            <button
              className={`${styles.toolbarButton} ${settingsVisible ? styles.active : ""}`}
              onClick={onToggleSettings}
              type="button"
            >
              <IconGear size={24} />
              <PulseDot
                className={`${styles.toolbarButtonStatus} ${!mcpConnected || settingsVisible ? styles.hidden : ""}`}
                size={6}
              />
            </button>
          </Tooltip>
          <div className={styles.toolbarDivider} />
          <Tooltip
            tooltip={<TooltipContent title="Exit" shortcut="Esc" />}
            placement="top"
            offset={12}
            disabled={tooltipsDisabled}
          >
            <button
              className={styles.toolbarButton}
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <IconXmarkLarge size={24} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

interface TooltipContentProps {
  title: string;
  shortcut?: string;
}

const TooltipContent = ({ title, shortcut }: TooltipContentProps) => {
  return (
    <p className={styles.tooltipContent}>
      {title}
      {shortcut && (
        <span className={styles.tooltipContentShortcut}>{shortcut}</span>
      )}
    </p>
  );
};
