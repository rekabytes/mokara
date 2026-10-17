export function supportAccentInk(hex: string) {
  const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
export function supportEmbed(url: string) {
  // URL is supplied by backend discovery from AUTH_PUBLIC_URL. Escape markup
  // attributes rather than treating an operator-configured URL as raw HTML.
  const escaped = url
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<iframe src="${escaped}" title="Submit a support ticket" loading="lazy" referrerpolicy="no-referrer" style="width:100%;max-width:800px;height:1040px;border:0;border-radius:18px"></iframe>`;
}
