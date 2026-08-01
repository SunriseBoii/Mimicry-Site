import type { HTMLAttributes, ReactNode } from "react";
import styles from "./layout.module.css";

type ContainerElement = "div" | "article" | "aside" | "nav";

type ContainerProps = HTMLAttributes<HTMLElement> & {
  as?: ContainerElement;
  children: ReactNode;
};

export function Container({
  as: Element = "div",
  children,
  className,
  ...props
}: ContainerProps) {
  return (
    <Element className={[styles.container, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </Element>
  );
}

export function Grid({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={[styles.grid, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}
