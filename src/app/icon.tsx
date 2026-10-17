import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 220,
        background: "#0f172a",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontWeight: 800,
        fontFamily: "sans-serif",
        borderRadius: "96px",
        border: "12px solid #1e293b",
      }}
    >
      <span style={{ transform: "translateY(-8px)" }}>A</span>
    </div>,
    {
      ...size,
    },
  );
}
