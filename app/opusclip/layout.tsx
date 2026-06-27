import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clip Operator",
  description: "Turn long videos into short clips with OpusClip."
};

export default function OpusClipLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
