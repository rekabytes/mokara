function colorChannels(hex: string) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}
function luminance(channels: number[]) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
}
export function supportAccentInk(hex: string) {
  return luminance(colorChannels(hex)) > 0.179 ? "#000000" : "#ffffff";
}
/** Preserve the selected hue while keeping white button labels at WCAG AA contrast. */
export function supportContrastRatio(background: string, text: string) {
  const values = [luminance(colorChannels(background)), luminance(colorChannels(text))];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}
export function supportButtonStyle(hex: string, textColor?: string | null) {
  if (textColor) return { backgroundColor: hex, color: textColor };
  let channels = colorChannels(hex);
  while (luminance(channels) > 1.05 / 4.5 - 0.05) {
    channels = channels.map((channel) => Math.floor(channel * 0.97));
  }
  return {
    backgroundColor:
      "#" + channels.map((channel) => channel.toString(16).padStart(2, "0")).join(""),
    color: "#ffffff",
  };
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
