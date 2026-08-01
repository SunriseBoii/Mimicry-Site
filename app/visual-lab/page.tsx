import { CaseCardFragment } from "./_components/CaseCardFragment";
import { FragmentFrame } from "./_components/FragmentFrame";
import { HeroFragment } from "./_components/HeroFragment";
import { MobileHeroFragment } from "./_components/MobileHeroFragment";
import { SituationsFragment } from "./_components/SituationsFragment";
import { SolutionFragment } from "./_components/SolutionFragment";
import { VisualLabShell } from "./_components/VisualLabShell";

export default function VisualLabPage() {
  return (
    <VisualLabShell>
      <FragmentFrame index="01" title="Desktop hero">
        <HeroFragment />
      </FragmentFrame>

      <FragmentFrame index="02" title="Четыре клиентские ситуации">
        <SituationsFragment />
      </FragmentFrame>

      <FragmentFrame index="03" title="Карточка кейса">
        <CaseCardFragment />
      </FragmentFrame>

      <FragmentFrame index="04" title="Фрагмент страницы решения">
        <SolutionFragment />
      </FragmentFrame>

      <FragmentFrame index="05" title="Mobile hero · реальная ширина 390 px">
        <MobileHeroFragment />
      </FragmentFrame>
    </VisualLabShell>
  );
}
