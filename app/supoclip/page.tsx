import SupoClipEmbed from "./supoclip-embed";

export const dynamic = "force-dynamic";

/**
 * Keep this page client-driven. Server-side health checks against the home
 * server used to hang on Vercel and surface as Internal Server Error.
 */
export default function SupoClipPage() {
  return <SupoClipEmbed />;
}
