"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Action } from "../_design-system/components";
import { primaryNavigation } from "./site-data";
import styles from "./site-shell.module.css";

const mobileMenuId = "site-mobile-navigation";

function isCurrentRoute(pathname: string, matchPrefix: string) {
  return pathname === matchPrefix || pathname.startsWith(`${matchPrefix}/`);
}

type NavigationLinkProps = {
  className: string;
  href: string;
  label: string;
  matchPrefix: string;
  onNavigate?: () => void;
  showCurrentLabel?: boolean;
};

function NavigationLink({
  className,
  href,
  label,
  matchPrefix,
  onNavigate,
  showCurrentLabel = false,
}: NavigationLinkProps) {
  const pathname = usePathname();
  const isCurrent = isCurrentRoute(pathname, matchPrefix);

  return (
    <a
      aria-current={isCurrent ? "page" : undefined}
      className={className}
      href={href}
      onClick={onNavigate}
    >
      <span>{label}</span>
      {isCurrent && showCurrentLabel ? (
        <span className={styles.currentLabel}>Текущий раздел</span>
      ) : null}
    </a>
  );
}

export function SiteNavigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      setIsOpen(false);
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const contactIsCurrent = pathname === "/contact";
  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => setIsOpen((value) => !value);

  return (
    <div className={styles.navigationRoot}>
      <nav className={styles.desktopNav} aria-label="Основная навигация">
        {primaryNavigation.map((item) => (
          <NavigationLink
            className={styles.navLink}
            href={item.href}
            label={item.label}
            matchPrefix={item.matchPrefix}
            key={item.href}
          />
        ))}
      </nav>

      <Action
        aria-current={contactIsCurrent ? "page" : undefined}
        className={styles.desktopCta}
        href="/contact"
        variant="primary"
      >
        Обсудить задачу
      </Action>

      <button
        aria-controls={mobileMenuId}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Закрыть основное меню" : "Открыть основное меню"}
        className={styles.menuButton}
        onClick={toggleMenu}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleMenu();
          }
        }}
        ref={menuButtonRef}
        type="button"
      >
        <span>{isOpen ? "Закрыть" : "Меню"}</span>
        <span aria-hidden="true">{isOpen ? "×" : "+"}</span>
      </button>

      <div className={styles.menuPanel} hidden={!isOpen} id={mobileMenuId}>
        <nav className={styles.mobileNav} aria-label="Мобильная навигация">
          {primaryNavigation.map((item) => (
            <NavigationLink
              className={styles.mobileNavLink}
              href={item.href}
              label={item.label}
              matchPrefix={item.matchPrefix}
              onNavigate={closeMenu}
              showCurrentLabel
              key={item.href}
            />
          ))}
          <Action
            aria-current={contactIsCurrent ? "page" : undefined}
            className={styles.mobileCta}
            href="/contact"
            onClick={closeMenu}
            variant="primary"
          >
            Обсудить задачу
          </Action>
        </nav>
      </div>
    </div>
  );
}
