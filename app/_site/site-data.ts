export const solutionLinks = [
  { href: "/solutions/change", label: "Изменения", code: "01" },
  { href: "/solutions/event", label: "События", code: "02" },
  { href: "/solutions/learning", label: "Обучение", code: "03" },
  { href: "/solutions/hr-brand", label: "HR-brand", code: "04" },
] as const;

export const primaryNavigation = [
  {
    href: "/solutions/change",
    label: "Решения",
    matchPrefix: "/solutions",
  },
  { href: "/cases", label: "Кейсы", matchPrefix: "/cases" },
  {
    href: "/capabilities/merch",
    label: "Компетенции",
    matchPrefix: "/capabilities",
  },
  { href: "/about", label: "О нас", matchPrefix: "/about" },
  {
    href: "/procurement",
    label: "Закупкам",
    matchPrefix: "/procurement",
  },
] as const;

export const capabilityAndProductLinks = [
  { href: "/capabilities/merch", label: "Мерч и физические носители" },
  { href: "/products/welcome-pack", label: "Welcome-pack" },
] as const;

export const companyLinks = [
  { href: "/cases", label: "Кейсы" },
  { href: "/about", label: "О компании" },
  { href: "/procurement", label: "Закупкам" },
  { href: "/contact", label: "Контакты" },
] as const;
