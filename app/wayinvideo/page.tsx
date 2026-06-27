import { redirect } from "next/navigation";

export default function WayinVideoLegacyPage() {
  redirect("/clip?provider=wayinvideo");
}
