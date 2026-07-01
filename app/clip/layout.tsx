import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clip Operator",
  description: "Compare WayinVideo and SupoClip clipping workflows."
};

export default function ClipLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
