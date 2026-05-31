import type { Metadata } from "next";
import { Inter, JetBrains_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { LayoutContent } from "@/components/layout-content";
import { UserMenu } from "@/components/auth/user-menu";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Archon — Construction Management",
  description: "AI-powered construction management — consents, RFIs, inspections.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ" className={`${inter.variable} ${jetbrains.variable} ${dmSans.variable}`}>
      <body>
        <ToastProvider>
          <LayoutContent userMenu={<UserMenu />}>{children}</LayoutContent>
        </ToastProvider>
      </body>
    </html>
  );
}
