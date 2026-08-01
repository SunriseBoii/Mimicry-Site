import type { HTMLAttributes, ReactNode } from "react";
import styles from "./markers.module.css";

export type LabelVariant = "default" | "evidence" | "process" | "status";

type LabelProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: LabelVariant;
};

export function Label({
  children,
  className,
  variant = "default",
  ...props
}: LabelProps) {
  return (
    <span
      className={[styles.label, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
