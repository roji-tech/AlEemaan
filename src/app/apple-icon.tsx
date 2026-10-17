import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 84,
        background: "#0f172a",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontWeight: 800,
        fontFamily: "sans-serif",
        borderRadius: "36px",
        border: "4px solid #1e293b",
      }}
    >
      <span style={{ transform: "translateY(-4px)" }}>A</span>
    </div>,
    {
      ...size,
    },
  );
}
