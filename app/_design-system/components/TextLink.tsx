import type { AnchorHTMLAttributes, ReactNode } from "react";
import styles from "./text-link.module.css";

type TextLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "children" | "href"
> & {
  children: ReactNode;
  directional?: boolean;
  href: string;
};

export function TextLink({
  children,
  className,
  directional = false,
  href,
  ...props
}: TextLinkProps) {
  return (
    <a
      className={[styles.link, className].filter(Boolean).join(" ")}
      href={href}
      {...props}
    >
      <span>{children}</span>
      {directional ? (
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
      ) : null}
    </a>
  );
}
