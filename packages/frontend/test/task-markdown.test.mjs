import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskMarkdown } from "../app/(app)/tasks/TaskMarkdown.tsx";

function render(text) {
  return renderToStaticMarkup(React.createElement(TaskMarkdown, null, text));
}

test("task descriptions and comments render GitHub-flavored structure with the drawer heading hierarchy", () => {
  const html = render(
    "## Goal\n\nMake **bundles** and *vouchers*.\n\n- First step\n- Second step\n\n1. Review\n2. Ship\n\n~~Old~~ `checkout`\n\n> Keep the context\n\n```ts\nconst total = 100;\n```\n\n| Item | Price |\n| --- | --- |\n| Bundle | 100 |\n\n- [x] Reviewed"
  );
  for (const pattern of [
    /<h4>Goal<\/h4>/,
    /<strong>bundles<\/strong>/,
    /<em>vouchers<\/em>/,
    /<ul>/,
    /<ol>/,
    /<del>Old<\/del>/,
    /<code>checkout<\/code>/,
    /<blockquote>/,
    /<pre><code class="language-ts">/,
    /<table>/,
    /type="checkbox"/,
    /disabled=""/,
  ])
    assert.match(html, pattern);
  assert.doesNotMatch(html, /<h1>|<h2>/);
});
test("untrusted Markdown cannot inject raw HTML, executable links, frames or tracking images", () => {
  const html = render(
    '<script>alert(1)</script>\n\n<iframe src="https://tracking.invalid"></iframe>\n\n<img src=x onerror="alert(1)">\n\n[Click](javascript:alert%281%29)\n\n[Data](data:text/html,hello)\n\n![Private image](https://tracking.invalid/pixel)'
  );
  assert.doesNotMatch(
    html,
    /<script|<iframe|<img|onerror|href="(?:javascript|data):|src="https:\/\/tracking/
  );
  assert.match(html, /Private image/);
});
test("links retain readable labels and open safely without losing their title", () => {
  const html = render('[Issue](https://github.com/example/project/issues/1 "Open issue")');
  assert.match(html, /href="https:\/\/github.com\/example\/project\/issues\/1"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /title="Open issue"/);
});
test("long briefs are not truncated and Markdown preserves escaped punctuation and plain text", () => {
  const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}.`).join("\n\n");
  const html = render(text);
  assert.match(html, /Paragraph 29\./);
  assert.equal((html.match(/<p>/g) || []).length, 30);
  assert.match(render("\\*literal\\* and <https://example.invalid>"), /\*literal\*/);
});
