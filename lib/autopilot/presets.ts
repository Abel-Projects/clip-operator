export type NicheId = "sharks" | "founders" | "general";

export type NichePreset = {
  id: NicheId;
  label: string;
  topicKeywords: string[];
  captionSuffix: string;
  extraHashtags: string;
};

export const NICHE_PRESETS: Record<NicheId, NichePreset> = {
  sharks: {
    id: "sharks",
    label: "Sharks / business deals",
    topicKeywords: [
      "deal",
      "valuation",
      "equity",
      "investment",
      "Shark Tank",
      "offer",
      "revenue"
    ],
    captionSuffix: "Follow for daily business clips.",
    extraHashtags: "#entrepreneur #business #sharktank #startup"
  },
  founders: {
    id: "founders",
    label: "Founders & startups",
    topicKeywords: [
      "founder",
      "startup",
      "pitch",
      "fundraising",
      "product",
      "launch",
      "growth"
    ],
    captionSuffix: "Follow for founder insights.",
    extraHashtags: "#startup #founder #entrepreneur #business"
  },
  general: {
    id: "general",
    label: "General entrepreneurship",
    topicKeywords: [
      "business",
      "money",
      "success",
      "mindset",
      "sales",
      "marketing"
    ],
    captionSuffix: "Follow for business content.",
    extraHashtags: "#entrepreneur #business #money #success"
  }
};

export function resolveNiche(niche: string): NichePreset {
  if (niche in NICHE_PRESETS) {
    return NICHE_PRESETS[niche as NicheId];
  }

  return NICHE_PRESETS.general;
}

export function buildAutopilotCaption(input: {
  title?: string | null;
  description?: string | null;
  niche: string;
}): { title: string; description: string } {
  const preset = resolveNiche(input.niche);
  const title = input.title?.trim() || "Business clip";
  const body = input.description?.trim() || title;
  const description = [body, preset.extraHashtags, preset.captionSuffix]
    .filter(Boolean)
    .join("\n\n");

  return { title, description };
}
