import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "DayBoard", template: "%s · DayBoard" },
  description: "A planner for students: calendar, tasks, classes, habits and focus in one place, with an assistant that adds things for you."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f3ee"
};

/** Applies the saved theme, accent and text size before first paint so the page never flashes the wrong colours. */
const themeScript = `(function(){try{var d=document.documentElement,m=localStorage.getItem("dayboard-theme-mode"),t=localStorage.getItem("dayboard-theme");var n=m==="auto"?(matchMedia("(prefers-color-scheme: dark)").matches?"night":"day"):(t==="night"?"night":"day");d.dataset.theme=n;d.style.colorScheme=n==="night"?"dark":"light";var p=JSON.parse(localStorage.getItem("dayboard:prefs")||"{}");if(p.accent&&p.accent!=="violet")d.dataset.accent=p.accent;if(p.textSize&&p.textSize!=="default")d.dataset.text=p.textSize;}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
