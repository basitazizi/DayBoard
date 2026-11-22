import { Suspense } from "react";
import { TasksPage } from "@/components/pages/tasks";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TasksPage />
    </Suspense>
  );
}
