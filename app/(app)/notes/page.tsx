import { Suspense } from "react";
import { NotesPage } from "@/components/pages/notes";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NotesPage />
    </Suspense>
  );
}
