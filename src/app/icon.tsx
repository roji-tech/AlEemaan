import { ImageResponse } from "next/og";
import { LOGO_ICON_ASPECT, LOGO_ICON_DATA_URI } from "@/lib/brand-icon";

export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

// The school's logo on a white rounded square (task 0082; it was a white "A" on navy). Served at `/icon` and listed in the web manifest.
const LOGO_WIDTH = 440;

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: "#ffffff",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "96px",
      }}
    >
      <img src={LOGO_ICON_DATA_URI} width={LOGO_WIDTH} height={Math.round(LOGO_WIDTH / LOGO_ICON_ASPECT)} alt="" />
    </div>,
    {
      ...size,
    },
  );
}
