import type { HTMLAttributes, ReactNode } from "react";
import styles from "./markers.module.css";

type EyebrowProps = HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
};

export function Eyebrow({ children, className, ...props }: EyebrowProps) {
  return (
    <p className={[styles.eyebrow, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </p>
  );
}
