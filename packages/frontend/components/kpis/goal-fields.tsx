import { ChevronDownIcon } from "@/components/Icons";
import type { ComponentProps } from "react";
export function GoalSelect(props: ComponentProps<"select">) {
  return (
    <span className="goal-select">
      <select {...props} />
      <ChevronDownIcon />
    </span>
  );
}
