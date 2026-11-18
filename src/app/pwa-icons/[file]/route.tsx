import { ImageResponse } from "next/og";
import { LOGO_ICON_ASPECT, LOGO_ICON_DATA_URI } from "@/lib/brand-icon";

// The two app icons the web manifest names besides `/icon` (task 0104): a 192 px one (Chrome will not offer to install without an icon of at least 192 and one of at least 512) and a 512 px
// "maskable" one. The picture is the school's logo on white, as in src/app/icon.tsx.
//   - `icon-192.png`: the same rounded square as `/icon`, scaled to 192 px.
//   - `icon-512-maskable.png`: white all the way to the edges, no rounding (the launcher crops it to a circle, a squircle or a square) and the logo in the middle. A launcher keeps only the
//     central circle of 80 % of the side (a 205 px radius here); the logo, 320 px wide and 206 px tall, has corners 190 px from the centre: inside it.
// Drawn on request and cached for a day (not "immutable": the logo may change and the address does not).
const ICONS = {
  "icon-192.png": { size: 192, logo: 165, radius: 36 },
  "icon-512-maskable.png": { size: 512, logo: 320, radius: 0 },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!Object.hasOwn(ICONS, file))
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const spec = ICONS[file as keyof typeof ICONS];
  return new ImageResponse(
    <div
      style={{
        background: "#ffffff",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: `${spec.radius}px`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn by the image generator, not shown in a page */}
      <img src={LOGO_ICON_DATA_URI} width={spec.logo} height={Math.round(spec.logo / LOGO_ICON_ASPECT)} alt="" />
    </div>,
    { width: spec.size, height: spec.size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
