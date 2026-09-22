import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RERA Quarterly Explorer",
  description: "Bengaluru Urban RERA project inventory explorer",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
