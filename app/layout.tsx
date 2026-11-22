import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Lora, Nunito } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { ThemeProvider } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "DayBoard", template: "%s · DayBoard" },
  description: "A planner for students: calendar, tasks, classes, habits and focus in one place, with an assistant that adds things for you."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0d0f"
};

/** Applies the saved theme, accent and text size before first paint so the page never flashes the wrong colours. */
const themeScript = `(function(){try{var d=document.documentElement,m=localStorage.getItem("dayboard-theme-mode"),t=localStorage.getItem("dayboard-theme");var n=m==="auto"?(matchMedia("(prefers-color-scheme: dark)").matches?"night":"day"):(t==="night"?"night":"day");d.dataset.theme=n;d.style.colorScheme=n==="night"?"dark":"light";var p=JSON.parse(localStorage.getItem("dayboard:prefs")||"{}");if(p.accent&&p.accent!=="mono"&&!(p.accent==="violet"&&!(p.version>=2)))d.dataset.accent=p.accent;if(p.textSize&&p.textSize!=="default")d.dataset.text=p.textSize;if(p.font&&p.font!=="modern")d.dataset.font=p.font;if(p.density==="compact")d.dataset.density="compact";if(p.backdrop&&p.backdrop!=="plain")d.dataset.backdrop=p.backdrop;if(p.accent==="custom"&&/^#[0-9a-f]{6}$/i.test(p.customAccent||""))d.style.setProperty("--accent",p.customAccent);var w=localStorage.getItem("dayboard:wallpaper");if(w)d.style.setProperty("--wallpaper",'url("'+w+'")');}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${nunito.variable} ${lora.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
