import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clip Operator",
  description: "Compare OpusClip and WayinVideo clipping workflows."
};

export default function ClipLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
