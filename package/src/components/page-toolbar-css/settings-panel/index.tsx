import { COLOR_OPTIONS, type OutputDetailLevel } from "..";
import { OUTPUT_DETAIL_OPTIONS } from "../../../utils/generate-output";
import { HelpTooltip } from "../../help-tooltip";
import {
  IconCheckSmallAnimated,
  IconChevronLeft,
  IconMoon,
  IconSun,
} from "../../icons";
import styles from "./styles.module.scss";

type MarkerClickBehavior = "edit" | "delete";

type ToolbarSettings = {
  outputDetail: OutputDetailLevel;
  autoClearAfterCopy: boolean;
  annotationColorId: string;
  blockInteractions: boolean;
  reactEnabled: boolean;
  markerClickBehavior: MarkerClickBehavior;
  webhookUrl: string;
  webhooksEnabled: boolean;
};

type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type SettingsPanelProps = {
  settings: ToolbarSettings;
  onSettingsChange: (patch: Partial<ToolbarSettings>) => void;

  isDarkMode: boolean;
  onToggleTheme: () => void;

  isDevMode: boolean;

  connectionStatus: ConnectionStatus;
  endpoint?: string;

  /** Whether the panel is mounted (controls enter/exit class) */
  isVisible: boolean;

  /** Position override: show panel above toolbar when toolbar is near bottom */
  toolbarNearBottom: boolean;

  settingsPage: "main" | "automations";
  onSettingsPageChange: (page: "main" | "automations") => void;

  onHideToolbar: () => void;
};

export function SettingsPanel({
  settings,
  onSettingsChange,
  isDarkMode,
  onToggleTheme,
  isDevMode,
  connectionStatus,
  endpoint,
  isVisible,
  toolbarNearBottom,
  settingsPage,
  onSettingsPageChange,
  onHideToolbar,
}: SettingsPanelProps) {
  return (
    <div
      className={`${styles.settingsPanel} ${isVisible ? styles.enter : styles.exit}`}
      onClick={(e) => e.stopPropagation()}
      style={
        toolbarNearBottom
          ? { bottom: "auto", top: "calc(100% + 0.5rem)" }
          : undefined
      }
    >
      <div className={styles.settingsPanelContainer}>
        {/* ── Main page ── */}
        <div
          className={`${styles.settingsPage} ${settingsPage === "automations" ? styles.slideLeft : ""}`}
        >
          <div className={styles.settingsHeader}>
            <span className={styles.settingsBrand}>
              <span className={styles.settingsBrandSlash}>/</span>
              agentation
            </span>
            <span className={styles.settingsVersion}>v{__VERSION__}</span>
            <button
              className={styles.themeToggle}
              onClick={onToggleTheme}
              title={
                isDarkMode ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              <span className={styles.themeIconWrapper}>
                <span
                  key={isDarkMode ? "sun" : "moon"}
                  className={styles.themeIcon}
                >
                  {isDarkMode ? <IconSun size={20} /> : <IconMoon size={20} />}
                </span>
              </span>
            </button>
          </div>

          {/* Output detail + React toggle */}
          <div className={styles.settingsSection}>
            <div className={styles.settingsRow}>
              <div className={styles.settingsLabel}>
                Output Detail
                <HelpTooltip content="Controls how much detail is included in the copied output" />
              </div>
              <button
                className={styles.cycleButton}
                onClick={() => {
                  const currentIndex = OUTPUT_DETAIL_OPTIONS.findIndex(
                    (opt) => opt.value === settings.outputDetail,
                  );
                  const nextIndex =
                    (currentIndex + 1) % OUTPUT_DETAIL_OPTIONS.length;
                  onSettingsChange({
                    outputDetail: OUTPUT_DETAIL_OPTIONS[nextIndex].value,
                  });
                }}
              >
                <span
                  key={settings.outputDetail}
                  className={styles.cycleButtonText}
                >
                  {
                    OUTPUT_DETAIL_OPTIONS.find(
                      (opt) => opt.value === settings.outputDetail,
                    )?.label
                  }
                </span>
                <span className={styles.cycleDots}>
                  {OUTPUT_DETAIL_OPTIONS.map((option) => (
                    <span
                      key={option.value}
                      className={`${styles.cycleDot} ${settings.outputDetail === option.value ? styles.active : ""}`}
                    />
                  ))}
                </span>
              </button>
            </div>

            <div
              className={`${styles.settingsRow} ${styles.settingsRowMarginTop} ${!isDevMode ? styles.settingsRowDisabled : ""}`}
            >
              <div className={styles.settingsLabel}>
                React Components
                <HelpTooltip
                  content={
                    !isDevMode
                      ? "Disabled — production builds minify component names, making detection unreliable. Use in development mode."
                      : "Include React component names in annotations"
                  }
                />
              </div>
              <label
                className={`${styles.toggleSwitch} ${!isDevMode ? styles.disabled : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isDevMode && settings.reactEnabled}
                  disabled={!isDevMode}
                  onChange={() =>
                    onSettingsChange({ reactEnabled: !settings.reactEnabled })
                  }
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            <div
              className={`${styles.settingsRow} ${styles.settingsRowMarginTop}`}
            >
              <div className={styles.settingsLabel}>
                Hide Until Restart
                <HelpTooltip content="Hides the toolbar until you open a new tab" />
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={(e) => {
                    if (e.target.checked) onHideToolbar();
                  }}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>
          </div>

          {/* Color picker */}
          <div className={styles.settingsSection}>
            <div
              className={`${styles.settingsLabel} ${styles.settingsLabelMarker}`}
            >
              Marker Color
            </div>
            <div className={styles.colorOptions}>
              {COLOR_OPTIONS.map((color) => (
                <div
                  key={color.id}
                  role="button"
                  onClick={() =>
                    onSettingsChange({ annotationColorId: color.id })
                  }
                  style={
                    {
                      "--swatch": color.srgb,
                      "--swatch-p3": color.p3,
                    } as React.CSSProperties
                  }
                  className={`${styles.colorOptionRing} ${settings.annotationColorId === color.id ? styles.selected : ""}`}
                >
                  <div
                    className={`${styles.colorOption} ${settings.annotationColorId === color.id ? styles.selected : ""}`}
                    title={color.label}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Checkboxes */}
          <div className={styles.settingsSection}>
            <label className={styles.settingsToggle}>
              <input
                type="checkbox"
                id="autoClearAfterCopy"
                checked={settings.autoClearAfterCopy}
                onChange={(e) =>
                  onSettingsChange({ autoClearAfterCopy: e.target.checked })
                }
              />
              <label
                className={`${styles.customCheckbox} ${settings.autoClearAfterCopy ? styles.checked : ""}`}
                htmlFor="autoClearAfterCopy"
              >
                {settings.autoClearAfterCopy && (
                  <IconCheckSmallAnimated size={14} />
                )}
              </label>
              <span className={styles.toggleLabel}>
                Clear on copy/send
                <HelpTooltip content="Automatically clear annotations after copying" />
              </span>
            </label>
            <label
              className={`${styles.settingsToggle} ${styles.settingsToggleMarginBottom}`}
            >
              <input
                type="checkbox"
                id="blockInteractions"
                checked={settings.blockInteractions}
                onChange={(e) =>
                  onSettingsChange({ blockInteractions: e.target.checked })
                }
              />
              <label
                className={`${styles.customCheckbox} ${settings.blockInteractions ? styles.checked : ""}`}
                htmlFor="blockInteractions"
              >
                {settings.blockInteractions && (
                  <IconCheckSmallAnimated size={14} />
                )}
              </label>
              <span className={styles.toggleLabel}>
                Block page interactions
              </span>
            </label>
          </div>

          {/* Nav to automations */}
          <div
            className={`${styles.settingsSection} ${styles.settingsSectionExtraPadding}`}
          >
            <button
              className={styles.settingsNavLink}
              onClick={() => onSettingsPageChange("automations")}
            >
              <span>Manage MCP & Webhooks</span>
              <span className={styles.settingsNavLinkRight}>
                {endpoint && connectionStatus !== "disconnected" && (
                  <span
                    className={`${styles.mcpNavIndicator} ${styles[connectionStatus]}`}
                  />
                )}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7.5 12.5L12 8L7.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          </div>
        </div>

        {/* ── Automations page ── */}
        <div
          className={`${styles.settingsPage} ${styles.automationsPage} ${settingsPage === "automations" ? styles.slideIn : ""}`}
        >
          <button
            className={styles.settingsBackButton}
            onClick={() => onSettingsPageChange("main")}
          >
            <IconChevronLeft size={16} />
            <span>Manage MCP & Webhooks</span>
          </button>

          {/* MCP section */}
          <div className={styles.settingsSection}>
            <div className={styles.settingsRow}>
              <span className={styles.automationHeader}>
                MCP Connection
                <HelpTooltip content="Connect via Model Context Protocol to let AI agents like Claude Code receive annotations in real-time." />
              </span>
              {endpoint && (
                <div
                  className={`${styles.mcpStatusDot} ${styles[connectionStatus]}`}
                  title={
                    connectionStatus === "connected"
                      ? "Connected"
                      : connectionStatus === "connecting"
                        ? "Connecting..."
                        : "Disconnected"
                  }
                />
              )}
            </div>
            <p
              className={styles.automationDescription}
              style={{ paddingBottom: 6 }}
            >
              MCP connection allows agents to receive and act on annotations.{" "}
              <a
                href="https://agentation.dev/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.learnMoreLink}
              >
                Learn more
              </a>
            </p>
          </div>

          {/* Webhooks section */}
          <div
            className={`${styles.settingsSection} ${styles.settingsSectionGrow}`}
          >
            <div className={styles.settingsRow}>
              <span className={styles.automationHeader}>
                Webhooks
                <HelpTooltip content="Send annotation data to any URL endpoint when annotations change. Useful for custom integrations." />
              </span>
              <div className={styles.autoSendRow}>
                <span
                  className={`${styles.autoSendLabel} ${settings.webhooksEnabled ? styles.active : ""}`}
                >
                  Auto-Send
                </span>
                <label
                  className={`${styles.toggleSwitch} ${!settings.webhookUrl ? styles.disabled : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={settings.webhooksEnabled}
                    disabled={!settings.webhookUrl}
                    onChange={() =>
                      onSettingsChange({
                        webhooksEnabled: !settings.webhooksEnabled,
                      })
                    }
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
            </div>
            <p className={styles.automationDescription}>
              The webhook URL will receive live annotation changes and
              annotation data.
            </p>
            <textarea
              className={styles.webhookUrlInput}
              placeholder="Webhook URL"
              value={settings.webhookUrl}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => onSettingsChange({ webhookUrl: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
