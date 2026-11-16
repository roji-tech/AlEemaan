import type { ImgHTMLAttributes } from "react";

/// A picture of the school website (task 0080). A plain `<img>` with its size written out, not `next/image`: that component writes an inline `style` attribute, which the application's page policy does not allow, and the
/// site's few pictures are small files in `public/school-site/` that need no resizing. `alt` is required (use `""` for a picture that only decorates).
export function SiteImage({
  alt,
  width,
  height,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "width" | "height" | "src"> & {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} width={width} height={height} loading="lazy" decoding="async" {...rest} />;
}
