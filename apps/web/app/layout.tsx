import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Nunito_Sans } from "next/font/google";
import "@hwa/ui/tokens.css";
import "./styles.css";

const display = Cormorant_Garamond({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-display", display: "swap" });
const body = Nunito_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = { title: "HWA Connect", description: "A private alumni community for Herbert W. Armstrong College." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#4E124A" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${body.variable}`}>{children}</body></html>;
}
