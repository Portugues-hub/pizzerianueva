import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Il Popolo Pasta & Pizza",
  description: "Panel de gestión",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
