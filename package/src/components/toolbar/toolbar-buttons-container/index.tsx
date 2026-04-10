import styles from "./styles.module.scss";

interface ToolbarButtonsContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ToolbarButtonsContainer = ({
  children,
  className = "",
  ...props
}: ToolbarButtonsContainerProps) => {
  return (
    <div
      className={`${styles.toolbarButtonsContainer} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
