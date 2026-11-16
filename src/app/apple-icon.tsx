import { ImageResponse } from "next/og";
import { LOGO_ICON_ASPECT, LOGO_ICON_DATA_URI } from "@/lib/brand-icon";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

// The school's logo on a white square (task 0082; it was a white "A" on navy). Square with no rounding, because iOS rounds the corners itself; the logo stays inside the middle 80 %, the "maskable" safe zone the
// web manifest declares for this icon. Served at `/apple-icon`.
const LOGO_WIDTH = 138;

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: "#ffffff",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img src={LOGO_ICON_DATA_URI} width={LOGO_WIDTH} height={Math.round(LOGO_WIDTH / LOGO_ICON_ASPECT)} alt="" />
    </div>,
    {
      ...size,
    },
  );
}
