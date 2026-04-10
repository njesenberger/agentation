import { useState } from "react";
import styles from "./styles.module.scss";

type ButtonStatus = "idle" | "success" | "error";

export interface ToolbarButtonProps {
  title: string;
  shortcut?: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  successIcon?: React.ReactNode;
  errorIcon?: React.ReactNode;
  onClick: () => Promise<void> | void;
  active?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

export const ToolbarButton = ({
  title,
  icon,
  activeIcon,
  successIcon,
  errorIcon,
  onClick,
  active,
  disabled,
  hidden,
}: ToolbarButtonProps) => {
  const [status, setStatus] = useState<ButtonStatus>("idle");

  // const handleClick = async () => {
  //   try {
  //     await onClick();
  //     setStatus("success");
  //   } catch {
  //     setStatus("error");
  //   } finally {
  //     setTimeout(() => setStatus("idle"), 2000);
  //   }
  // };

  const currentIcon =
    (status === "success" && successIcon) ||
    (status === "error" && errorIcon) ||
    (active && activeIcon) ||
    icon;

  return (
    <button
      className={`${styles.toolbarButton} ${active ? styles.active : ""} ${hidden ? styles.hidden : ""}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      {currentIcon}
    </button>
  );
};
