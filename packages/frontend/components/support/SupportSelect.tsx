import type { ComponentProps } from "react";
import { SupportChevron } from "./SupportChevron";
export function SupportSelect(props: ComponentProps<"select">) {
  return (
    <span className="support-select">
      <select {...props} />
      <SupportChevron className="support-select-chevron" />
    </span>
  );
}
