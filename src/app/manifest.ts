import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name} School Management`,
    short_name: "AlEemaan",
    description: brand.description,
    start_url: "/students",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    orientation: "any",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "School Calculator",
        short_name: "Calculator",
        description: "Fee discount and grade calculations",
        url: "/students?tool=calculator",
      },
      {
        name: "Student Lookup",
        short_name: "Lookup",
        description: "Quick student profile and attendance lookup",
        url: "/students?tool=lookup",
      },
      {
        name: "Take Attendance",
        short_name: "Attendance",
        description: "Mark class roll-call attendance",
        url: "/attendance",
      },
      {
        name: "Quick Notes",
        short_name: "Notes",
        description: "Temporary memos and scratchpad",
        url: "/students?tool=scratchpad",
      },
    ],
  };
}
