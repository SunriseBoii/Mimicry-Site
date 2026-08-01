import {
  Container,
  Copy,
  Label,
  TextLink,
} from "../_design-system/components";
import {
  capabilityAndProductLinks,
  companyLinks,
  solutionLinks,
} from "./site-data";
import styles from "./site-shell.module.css";

type FooterLink = {
  href: string;
  label: string;
};

function FooterLinkGroup({
  label,
  links,
}: {
  label: string;
  links: readonly FooterLink[];
}) {
  return (
    <nav aria-label={label} className={styles.footerGroup}>
      <Label className={styles.footerLabel}>{label}</Label>
      <ul className={styles.footerLinks}>
        {links.map((link) => (
          <li key={link.href}>
            <TextLink href={link.href}>{link.label}</TextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Container className={styles.footerGrid}>
        <div className={styles.footerIdentity}>
          <strong>Mimicry group</strong>
          <Copy>
            Агентство корпоративных коммуникаций. Спецпроекты для сотрудников.
          </Copy>
        </div>

        <FooterLinkGroup label="Клиентские ситуации" links={solutionLinks} />
        <FooterLinkGroup
          label="Компетенции и продукты"
          links={capabilityAndProductLinks}
        />
        <FooterLinkGroup label="Компания" links={companyLinks} />
      </Container>
    </footer>
  );
}
