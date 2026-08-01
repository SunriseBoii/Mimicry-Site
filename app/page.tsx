import type { Metadata } from "next";
import { SiteShell } from "./_site/SiteShell";
import { CapabilitiesSection } from "./_home/CapabilitiesSection";
import { EvidenceSection, ProofStrip } from "./_home/EvidenceSection";
import { FinalCta } from "./_home/FinalCta";
import { HomeHero } from "./_home/HomeHero";
import { ProblemSection, SolutionsSection } from "./_home/HomeNarrative";
import { ProcessSection } from "./_home/ProcessSection";
import {
  OperationsSection,
  ProcurementSection,
} from "./_home/TrustSections";

export const metadata: Metadata = {
  title: "Mimicry group — агентство корпоративных коммуникаций",
  description:
    "Mimicry group создаёт спецпроекты для сотрудников и доводит их от коммуникационной логики до запуска.",
};

export default function Home() {
  return (
    <SiteShell>
      <HomeHero />
      <ProofStrip />
      <EvidenceSection />
      <ProblemSection />
      <SolutionsSection />
      <ProcessSection />
      <CapabilitiesSection />
      <OperationsSection />
      <ProcurementSection />
      <FinalCta />
    </SiteShell>
  );
}
