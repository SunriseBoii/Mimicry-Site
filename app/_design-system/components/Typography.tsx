import type { HTMLAttributes, ReactNode } from "react";
import styles from "./typography.module.css";

type TypographyElement = "h1" | "h2" | "h3" | "p" | "span";

type BaseTypographyProps = HTMLAttributes<HTMLElement> & {
  as?: TypographyElement;
  children: ReactNode;
};

type DisplayProps = BaseTypographyProps & {
  size?: "xl" | "lg";
};

export function Display({
  as: Element = "p",
  children,
  className,
  size = "xl",
  ...props
}: DisplayProps) {
  const sizeClass = size === "xl" ? styles.displayXl : styles.displayLg;

  return (
    <Element
      className={[styles.display, sizeClass, className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </Element>
  );
}

type HeadingProps = BaseTypographyProps & {
  level: 1 | 2 | 3;
};

export function Heading({
  as,
  children,
  className,
  level,
  ...props
}: HeadingProps) {
  const Element = as ?? (`h${level}` as "h1" | "h2" | "h3");
  const levelClass = {
    1: styles.heading1,
    2: styles.heading2,
    3: styles.heading3,
  }[level];

  return (
    <Element
      className={[styles.heading, levelClass, className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </Element>
  );
}

type CopyVariant = "lead" | "body-large" | "body" | "small" | "mono";

type CopyProps = BaseTypographyProps & {
  variant?: CopyVariant;
};

export function Copy({
  as: Element = "p",
  children,
  className,
  variant = "body",
  ...props
}: CopyProps) {
  const variantClass = {
    lead: styles.lead,
    "body-large": styles.bodyLarge,
    body: styles.body,
    small: styles.small,
    mono: styles.mono,
  }[variant];

  return (
    <Element
      className={[variantClass, className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </Element>
  );
}
