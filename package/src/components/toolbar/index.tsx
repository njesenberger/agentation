import { IconListSparkle } from "../icons";
import styles from "./styles.module.scss";

interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const Toolbar = ({
  className = "",
  children,
  open,
  onOpenChange,
  ...props
}: ToolbarProps) => {
  return (
    <div className={`${styles.toolbarWrapper} ${className}`} {...props}>
      {/* panels */}
      <div className={styles.toolbar}>
        <div className={styles.menuBadge}></div>
        <button
          className={styles.menuButton}
          type="button"
          onClick={() => onOpenChange(!open)}
        >
          <IconListSparkle />
        </button>
        <div className={styles.toolbarButtonsContainer}>{children}</div>
      </div>
    </div>
  );
};
