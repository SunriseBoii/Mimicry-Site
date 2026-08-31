"use client";

import { useEffect, useId, useRef } from "react";
import type { ContactDraft, ContactErrors } from "../build-flow";
import styles from "../ps04m5.module.css";

export function ContactDialog({
  contact,
  errors,
  onChange,
  onClose,
  onSubmit,
}: {
  contact: ContactDraft;
  errors: ContactErrors;
  onChange: (next: ContactDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialogRef.current;
    const previously = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>("button, input, textarea, [href]") ?? [])
      .filter((item) => !item.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !node) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previously?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.dialogRoot} data-qa="m4-contact-dialog">
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>Контакт для черновика</h2>
        <p className={styles.lede}>Данные никуда не отправляются и не сохраняются. Юридическая формулировка согласия не финальная.</p>
        <label>
          ФИО
          <input
            value={contact.name}
            autoComplete="name"
            onChange={(event) => onChange({ ...contact, name: event.target.value })}
          />
          {errors.name ? <span className={styles.error} role="alert">{errors.name}</span> : null}
        </label>
        <label>
          Телефон или Telegram
          <input
            value={contact.channel}
            autoComplete="tel"
            onChange={(event) => onChange({ ...contact, channel: event.target.value })}
          />
          {errors.channel ? <span className={styles.error} role="alert">{errors.channel}</span> : null}
        </label>
        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={contact.consent}
            onChange={(event) => onChange({ ...contact, consent: event.target.checked })}
          />
          <span>Даю предварительное согласие на обработку указанных данных в рамках прототипа. Это не юридически утверждённая формулировка.</span>
        </label>
        {errors.consent ? <p className={styles.error} role="alert">{errors.consent}</p> : null}
        <div className={styles.actions}>
          <button type="button" onClick={onSubmit}>Имитировать отправку</button>
          <button type="button" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

export function SuccessStatus({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.dialogRoot} data-qa="m4-success">
      <div className={styles.dialog} role="status" aria-live="polite">
        <h2>Ваша заявка принята, скоро с вами свяжемся</h2>
        <p className={styles.lede}>Это временное состояние поверх Brief. Оно держится 4.2 с или до закрытия. В граф не попадает. Сеть не вызывалась.</p>
        <button type="button" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}
