import { Suspense } from "react";
import { FocusPage } from "@/components/focus-page";

export default function Page() {
  return <Suspense fallback={<main className="min-h-dvh bg-white" />}><FocusPage /></Suspense>;
}
