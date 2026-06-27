import { redirect } from "next/navigation";

export default function OpusClipLegacyPage() {
  redirect("/clip?provider=opusclip");
}
