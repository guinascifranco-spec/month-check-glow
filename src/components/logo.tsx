import logoAsset from "@/assets/logo.png.asset.json";

export function Logo({
  className = "",
  height = 32,
  alt = "Month Check",
}: {
  className?: string;
  height?: number;
  alt?: string;
}) {
  return (
    <img
      src={logoAsset.url}
      alt={alt}
      height={height}
      style={{ height, width: "auto" }}
      className={className}
      draggable={false}
    />
  );
}
