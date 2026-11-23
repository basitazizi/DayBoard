import type { Metadata } from "next";
import { WelcomePage } from "@/components/welcome-page";

export const metadata: Metadata = {
  title: "Welcome"
};

export default function Page() {
  return <WelcomePage />;
}
