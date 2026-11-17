import type { Metadata } from "next";
import { Suspense } from "react";
import { ConvexAuthNextjsServerProvider } from "@/lib/convex-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PerfectPlate", template: "%s · PerfectPlate" },
  description: "Turn recipe emails and ideas into a recipe book and an organized grocery list.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {/* The provider reads the auth cookie, which is request-time data. */}
        <Suspense>
          <ConvexAuthNextjsServerProvider>{children}</ConvexAuthNextjsServerProvider>
        </Suspense>
      </body>
    </html>
  );
}
