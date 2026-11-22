import { Suspense } from "react";
import { CalendarPage } from "@/components/pages/calendar";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CalendarPage />
    </Suspense>
  );
}
