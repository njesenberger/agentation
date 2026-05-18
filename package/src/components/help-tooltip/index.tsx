import { Tooltip } from "../tooltip";
import { IconHelp } from "../icons";
import styles from "./styles.module.scss";

interface HelpTooltipProps {
  content: string;
}

export const HelpTooltip = ({ content }: HelpTooltipProps) => {
  return (
    <Tooltip
      className={styles.tooltip}
      tooltip={content}
      tooltipStyle={{
        transform: "translateY(-50%)",
        padding: "6px 10px",
        background: "#383838",
        color: "rgba(255, 255, 255, 0.7)",
        fontSize: "11px",
        fontWeight: 400,
        lineHeight: "14px",
        borderRadius: "10px",
        width: "180px",
        textAlign: "left" as const,
        pointerEvents: "none" as const,
        boxShadow: "0px 1px 8px rgba(0, 0, 0, 0.28)",
      }}
    >
      <IconHelp className={styles.tooltipIcon} />
    </Tooltip>
  );
};
