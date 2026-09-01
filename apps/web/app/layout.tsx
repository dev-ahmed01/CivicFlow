import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@civicos/shared";
import "./design-tokens.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "City Connect civic coordination application",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
