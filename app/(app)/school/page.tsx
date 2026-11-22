import { Suspense } from "react";
import { SchoolPage } from "@/components/pages/school";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SchoolPage />
    </Suspense>
  );
}
