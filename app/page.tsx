import type { Metadata } from "next";
import { ProductionPhotonicSiteClient } from "./_photonic-skin/ProductionPhotonicSiteClient";

export const metadata: Metadata = {
  title: "Mimicry group — агентство корпоративных коммуникаций",
  description:
    "Mimicry group создаёт спецпроекты для сотрудников и доводит их от коммуникационной логики до запуска.",
};

export default function Home() {
  return <ProductionPhotonicSiteClient />;
}
