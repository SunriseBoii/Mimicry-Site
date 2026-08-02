import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import styles from "./action.module.css";

export type ActionVariant = "primary" | "accent" | "secondary" | "directional";

type CommonActionProps = {
  arrow?: boolean;
  children: ReactNode;
  className?: string;
  variant?: ActionVariant;
};

type ActionAnchorProps = CommonActionProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className" | "href"> & {
    disabled?: never;
    href: string;
  };

type ActionButtonProps = CommonActionProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
    href?: never;
  };

export type ActionProps = ActionAnchorProps | ActionButtonProps;

function getActionClasses(variant: ActionVariant, className?: string) {
  return [styles.action, styles[variant], className].filter(Boolean).join(" ");
}

function ActionContent({
  arrow,
  children,
  variant,
}: Pick<CommonActionProps, "arrow" | "children"> & {
  variant: ActionVariant;
}) {
  const showArrow = arrow ?? variant !== "secondary";

  return (
    <>
      <span>{children}</span>
      {showArrow ? (
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
      ) : null}
    </>
  );
}

function ActionAnchor({
  arrow,
  children,
  className,
  href,
  variant = "primary",
  ...props
}: ActionAnchorProps) {
  return (
    <a className={getActionClasses(variant, className)} href={href} {...props}>
      <ActionContent arrow={arrow} variant={variant}>
        {children}
      </ActionContent>
    </a>
  );
}

function ActionButton({
  arrow,
  children,
  className,
  type = "button",
  variant = "primary",
  ...props
}: ActionButtonProps) {
  return (
    <button
      className={getActionClasses(variant, className)}
      type={type}
      {...props}
    >
      <ActionContent arrow={arrow} variant={variant}>
        {children}
      </ActionContent>
    </button>
  );
}

export function Action(props: ActionProps) {
  if ("href" in props && typeof props.href === "string") {
    return <ActionAnchor {...props} />;
  }

  return <ActionButton {...props} />;
}
