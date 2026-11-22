import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

// The latin-ext subset contains the rupee sign.
const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-space-grotesk" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], display: "swap", weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = { title: "Rado" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${plexMono.variable} antialiased`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
