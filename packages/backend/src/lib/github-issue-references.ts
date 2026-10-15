import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
};

const CLOSING_REFERENCE =
  /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)(?:\s*:\s*|\s+)(?:https:\/\/github\.com\/(?<urlOwner>[\w.-]+)\/(?<urlRepo>[\w.-]+)\/issues\/|(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)#|#)(?<number>[1-9]\d*)(?![\w/?#-])/gi;

function prose(node: MarkdownNode, definitions: Map<string, string>): string {
  const pending = [...(node.children ?? [])].reverse();
  const parts: string[] = [];
  while (pending.length) {
    const next = pending.pop();
    if (!next) continue;
    if (next.type === "text") parts.push(next.value ?? "");
    else if (next.type === "break") parts.push("\n");
    else if (next.type === "link") parts.push(next.url ?? "\0");
    else if (next.type === "linkReference")
      parts.push(definitions.get(next.identifier ?? "") ?? "\0");
    else if (next.type === "emphasis" || next.type === "strong")
      pending.push(...(next.children ?? []).slice().reverse());
    else parts.push("\0");
  }
  return parts.join("");
}

/** Explicit same-repository closing intent, including PRs targeting non-default branches.
 * Parse Markdown so quoted examples, code, hidden comments and link labels cannot
 * manufacture a closing reference. The fetched body is never persisted or logged. */
export function closingIssueNumbers(body: string, repository: { owner: string; name: string }) {
  const tree = fromMarkdown(body, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const definitions = new Map<string, string>();
  const definitionNodes: MarkdownNode[] = [tree];
  while (definitionNodes.length) {
    const node = definitionNodes.pop();
    if (!node) continue;
    if (node.type === "definition" && node.identifier && node.url) {
      if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    } else definitionNodes.push(...(node.children ?? []).slice().reverse());
  }
  const pending: MarkdownNode[] = [tree];
  const numbers = new Set<number>();
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (["root", "list", "listItem"].includes(node.type)) {
      pending.push(...(node.children ?? []).slice().reverse());
      continue;
    }
    if (node.type !== "paragraph" && node.type !== "heading") continue;
    for (const match of prose(node, definitions).matchAll(CLOSING_REFERENCE)) {
      const groups = match.groups;
      if (!groups) continue;
      const owner = groups.urlOwner ?? groups.owner;
      const name = groups.urlRepo ?? groups.repo;
      if (
        (owner && owner.toLowerCase() !== repository.owner.toLowerCase()) ||
        (name && name.toLowerCase() !== repository.name.toLowerCase())
      )
        continue;
      const number = Number(groups.number);
      if (Number.isSafeInteger(number) && number <= 2_147_483_647) numbers.add(number);
    }
  }
  return [...numbers];
}
