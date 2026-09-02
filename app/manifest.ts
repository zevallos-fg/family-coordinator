import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable identity across manifest edits. Without it, Chrome can treat a
    // changed start_url as a different app and mint a second WebAPK.
    id: "/?source=pwa",
    name: "Family Coordinator",
    short_name: "Family",
    description: "What needs attention, and what you'd otherwise forget.",
    start_url: "/now",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: "#b45309",
    icons: [
      // "any" keeps its own rounded tile — this is what iOS and desktop use.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // "maskable" must be full-bleed: Android applies its own adaptive mask, so a
      // rounded source leaves transparent notches at the corners of the launcher icon.
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android surfaces these on long-press of the launcher icon. iOS ignores them.
    shortcuts: [
      {
        name: "Capture something",
        short_name: "Capture",
        url: "/capture",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Shopping list",
        short_name: "To buy",
        url: "/grocery",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
