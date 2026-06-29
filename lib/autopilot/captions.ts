export function buildAutopilotCaption(input: {
  title?: string | null;
  description?: string | null;
}): { title: string; description: string } {
  const title = input.title?.trim() || "Clip";
  const description = input.description?.trim() || title;

  return { title, description };
}
