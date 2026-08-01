import type { HTMLAttributes, ReactNode } from "react";
import { Container } from "./Container";
import styles from "./layout.module.css";

export type SectionSurface = "background" | "surface" | "indigo" | "evidence";

type SectionProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  contained?: boolean;
  surface?: SectionSurface;
};

export function Section({
  children,
  className,
  contained = true,
  surface = "background",
  ...props
}: SectionProps) {
  const classes = [styles.section, styles[surface], className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} {...props}>
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}
