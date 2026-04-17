import styles from "./styles.module.scss";

interface PulseDotProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: React.CSSProperties["width"];
  color?: React.CSSProperties["backgroundColor"];
}

export const PulseDot = ({
  className = "",
  size = 8,
  color = "var(--agentation-color-green)",
  style,
  ...props
}: PulseDotProps) => {
  return (
    <div
      className={`${styles.pulseDot} ${className}`}
      style={{ width: size, height: size, backgroundColor: color, ...style }}
      {...props}
    ></div>
  );
};
