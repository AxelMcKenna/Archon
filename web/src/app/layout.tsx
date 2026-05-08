import type { Metadata } from "next";
import "./globals.css";
import { LayoutContent } from "@/components/layout-content";

export const metadata: Metadata = {
  title: "ConsentIQ — RFI",
  description: "Canterbury BCA RFI ingestion, classification, and response drafting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ">
      <body>
        <LayoutContent>{children}</LayoutContent>
      </body>
    </html>
  );
}
