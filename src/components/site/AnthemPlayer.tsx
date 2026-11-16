"use client";

import { useRef, useState } from "react";
import { SiteIcon } from "./icons";

const VERSIONS = [
  { src: "/school-site/anthem.mp3", label: "Anthem 1 (Default)" },
  { src: "/school-site/anthem2.mp3", label: "Anthem 2 (Alternate)" },
];

/// The anthem's audio (task 0080): the browser's own player (play, pause, seek, volume, keyboard) and a choice between the two recordings. Choosing one stops the one playing and loads the other; nothing plays by itself.
export function AnthemPlayer() {
  const audio = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState(VERSIONS[0].src);
  return (
    <div className="mx-auto max-w-xl rounded-[20px] bg-[linear-gradient(135deg,#2a7f4f,#006400)] p-8 text-center text-white">
      <h3 className="mb-4 flex items-center justify-center gap-2 text-xl font-bold">
        <SiteIcon name="star" className="size-5" />
        Listen to the Anthem
      </h3>
      <audio ref={audio} key={src} controls preload="none" className="w-full">
        <source src={src} type="audio/mpeg" />
        Your browser cannot play this recording.
      </audio>
      <label className="mt-5 block text-sm">
        <span className="mb-1 block opacity-90">Version</span>
        <select
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          className="w-full rounded-lg border border-[#90ee90] bg-white px-3 py-2 text-[#222] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {VERSIONS.map((v) => (
            <option key={v.src} value={v.src}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
