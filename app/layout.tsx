import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "El Rincón de Pepe",
  description: "Panel de gestión",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
