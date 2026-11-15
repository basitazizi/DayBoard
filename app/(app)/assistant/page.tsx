import { Suspense } from "react";
import { AssistantPage } from "@/components/pages/assistant";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AssistantPage />
    </Suspense>
  );
}
