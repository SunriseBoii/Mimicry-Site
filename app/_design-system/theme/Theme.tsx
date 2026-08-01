import type { HTMLAttributes, ReactNode } from "react";
import { designSystemFontVariables } from "../fonts";
import styles from "./theme.module.css";
import tokens from "./tokens.module.css";

type ThemeElement = "div" | "main";

type DesignSystemThemeProps = HTMLAttributes<HTMLElement> & {
  as?: ThemeElement;
  children: ReactNode;
};

export function DesignSystemTheme({
  as: Element = "div",
  children,
  className,
  ...props
}: DesignSystemThemeProps) {
  const classes = [
    tokens.tokens,
    styles.theme,
    designSystemFontVariables,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Element className={classes} {...props}>
      {children}
    </Element>
  );
}
