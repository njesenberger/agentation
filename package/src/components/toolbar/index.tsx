import { useRef } from "react";
import {
  IconCopyAnimated,
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
  sendFeedbackVisible: boolean;
  onSendFeedback: () => void;
  onClear: () => void;
  settingsVisible: boolean;
  onToggleSettings: () => void;
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
  sendFeedbackVisible,
  onSendFeedback,
  onClear,
  settingsVisible,
  onToggleSettings,
  ...props
}: ToolbarProps) => {
  // const toolbarItems: ToolbarButtonProps[] = [
  //   {
  //     title: animationsPaused ? "Resume animations" : "Pause animations",
  //     shortcut: "P",
  //     icon: <IconPausePlayAnimated size={24} isPaused={false} />,
  //     activeIcon: <IconPausePlayAnimated size={24} isPaused={true} />,
  //     active: animationsPaused,
  //     onClick: onToggleAnimations,
  //   },
  //   {
  //     title: layoutModeActive ? "Exit layout mode" : "Layout mode",
  //     shortcut: "L",
  //     icon: <IconLayout />,
  //     active: layoutModeActive,
  //     onClick: onToggleLayoutMode,
  //   },
  //   {
  //     title: markersVisible ? "Hide markers" : "Show markers",
  //     shortcut: "H",
  //     icon: <IconEyeAnimated size={24} isOpen={markersVisible} />,
  //     disabled: !hasAnnotations || isDesignMode,
  //     onClick: () => {
  //       hideTooltipsUntilMouseLeave();
  //       setShowMarkers(!showMarkers);
  //     },
  //   },
  //   {
  //     title: isDesignMode && blankCanvas ? "Copy layout" : "Copy feedback",
  //     shortcut: "C",
  //     icon: <IconCopyAnimated size={24} copied={false} />,
  //     successIcon: <IconCopyAnimated size={24} copied={true} />,
  //     // active: copied,
  //     // disabled:
  //     //   !hasAnnotations &&
  //     //   drawStrokes.length === 0 &&
  //     //   designPlacements.length === 0,
  //     disabled: false,
  //     onClick: onCopyFeedback,
  //   },
  //   {
  //     title: "Send Annotations",
  //     shortcut: "S",
  //     icon: <IconSendArrow size={24} state="idle" />,
  //     successIcon: <IconSendArrow size={24} state="sent" />,
  //     errorIcon: <IconSendArrow size={24} state="failed" />,
  //     hidden: !(
  //       !settings.webhooksEnabled &&
  //       isValidUrl(settings.webhookUrl || webhookUrl || "")
  //     ),
  //     disabled: !hasAnnotations || sendState === "sending",
  //     onClick: sendToWebhook,
  //   },
  //   {
  //     title: "Clear all",
  //     shortcut: "X",
  //     icon: <IconTrashAlt size={24} />,
  //     disabled:
  //       !hasAnnotations &&
  //       drawStrokes.length === 0 &&
  //       designPlacements.length === 0,
  //     onClick: clearAll,
  //   },
  //   {
  //     title: "Settings",
  //     icon: <IconGear size={24} />,
  //     onClick: () => {
  //       hideTooltipsUntilMouseLeave();
  //       if (isDesignMode) closeDesignMode();
  //       setShowSettings(!showSettings);
  //     },
  //   },
  // ];

  const previousBadgeCount = useRef(badgeCount);

  if (badgeCount) {
    previousBadgeCount.current = badgeCount;
  }

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
          <button
            className={`${styles.toolbarButton} ${animationsPaused ? styles.enabled : ""}`}
            onClick={onToggleAnimations}
            type="button"
          >
            <IconPausePlayAnimated isPaused={animationsPaused} size={24} />
          </button>
          <button
            className={`${styles.toolbarButton} ${layoutModeActive ? styles.enabled : ""}`}
            onClick={onToggleLayoutMode}
            type="button"
          >
            <IconLayout size={24} />
          </button>
          <button
            className={styles.toolbarButton}
            onClick={onToggleMarkers}
            type="button"
            disabled={!badgeCount || layoutModeActive}
          >
            <IconEyeAnimated isOpen={markersVisible} size={24} />
          </button>
          <button
            className={styles.toolbarButton}
            onClick={() => {}}
            type="button"
            disabled={!badgeCount}
          >
            <IconCopyAnimated size={24} />
          </button>
          <button
            className={`${styles.toolbarButton} ${!sendFeedbackVisible ? styles.hidden : ""}`}
            onClick={onSendFeedback}
            type="button"
            disabled={!badgeCount}
          >
            <IconSendArrow
              className={styles.toolbarButtonIcon}
              size={24}
              state="idle"
            />
            <span
              className={`${styles.toolbarButtonBadge} ${!badgeCount ? styles.hidden : ""}`}
            >
              {previousBadgeCount.current}
            </span>
          </button>
          <button
            className={styles.toolbarButton}
            onClick={onClear}
            type="button"
            disabled={!badgeCount}
          >
            <IconTrashAlt size={24} />
          </button>
          <button
            className={`${styles.toolbarButton} ${settingsVisible ? styles.active : ""}`}
            onClick={onToggleSettings}
            type="button"
          >
            <IconGear size={24} />
          </button>
          <div className={styles.toolbarDivider}></div>
          <button
            className={styles.toolbarButton}
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <IconXmarkLarge size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
