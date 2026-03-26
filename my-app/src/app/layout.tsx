import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { UserProvider } from "@/lib/context/user-context";
import { assertSingleOrgRuntime } from "@/lib/single-org";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Karya | Thread Tracker",
    template: "%s | Karya",
  },
  description:
    "Karya helps teams turn conversations into clear decisions, accountable ownership, and trackable execution.",
  applicationName: "Karya",
  keywords: [
    "Karya",
    "Thread Tracker",
    "collaboration",
    "team decisions",
    "task tracking",
  ],
  metadataBase: new URL("http://localhost:3000"),
  openGraph: {
    title: "Karya | Thread Tracker",
    description:
      "Turn conversations into decisions and action with Karya.",
    type: "website",
    locale: "en_US",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await assertSingleOrgRuntime();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
