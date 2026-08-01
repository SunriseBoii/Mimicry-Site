import {
  Copy,
  Eyebrow,
  Heading,
} from "../_design-system/components";
import styles from "./home.module.css";

export function HomeSectionIntro({
  eyebrow,
  id,
  text,
  title,
}: {
  eyebrow: string;
  id: string;
  text?: string;
  title: string;
}) {
  return (
    <header className={styles.sectionIntro}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading id={id} level={2}>
        {title}
      </Heading>
      {text ? <Copy variant="body-large">{text}</Copy> : null}
    </header>
  );
}
