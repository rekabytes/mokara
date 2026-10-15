import { test } from "node:test";
import assert from "node:assert/strict";
import { closingIssueNumbers } from "../src/lib/github-issue-references.ts";

const repository = { owner: "test", name: "repository" };

test("all supported closing keywords work in prose, headings and lists", () => {
  const keywords = [
    "close",
    "closes",
    "closed",
    "fix",
    "fixes",
    "fixed",
    "resolve",
    "resolves",
    "resolved",
  ];
  for (const keyword of keywords)
    assert.deepEqual(closingIssueNumbers(`${keyword} #123`, repository), [123]);
  assert.deepEqual(
    closingIssueNumbers("## **CLOSES:** #123\n\n- Fixes #124\n- Resolves #125", repository),
    [123, 124, 125]
  );
});

test("qualified and linked issue references must resolve to the same repository", () => {
  assert.deepEqual(
    closingIssueNumbers(
      [
        "Closes TEST/Repository#123",
        "Fixes https://github.com/test/repository/issues/124",
        "Resolves [#125](https://github.com/test/repository/issues/125)",
        "Closes [#126](https://github.com/other/repository/issues/126)",
        "Closes other/repository#127",
        "Closes test/another#128",
        "Closes [#129](https://example.invalid/issue/129)",
      ].join("\n\n"),
      repository
    ),
    [123, 124, 125]
  );
});

test("examples and ordinary mentions cannot change task or issue state", () => {
  const body = [
    "Related to #123; see #124. This discloses #125.",
    "`Closes #126`",
    "Closes `#127`",
    "```md\nCloses #128\n```",
    "    Closes #129",
    "> Closes #130",
    "<!-- Closes #131 -->",
    "Closes [a reference](https://example.invalid/path)",
    "[Closes #132](https://example.invalid/path)",
    "![Closes #133](https://example.invalid/image.png)",
    "~~Closes #134~~",
    "Closes ~~#135~~",
    "Closes #0; closes #2147483648; closes #123abc; closes #123/path",
  ].join("\n\n");
  assert.deepEqual(closingIssueNumbers(body, repository), []);
});

test("reference-style links use their destination, never a misleading issue label", () => {
  assert.deepEqual(
    closingIssueNumbers(
      [
        "Closes [#123][local]",
        "Fixes [#124][other]",
        "[local]: https://github.com/test/repository/issues/123",
        "[other]: https://github.com/other/repository/issues/124",
      ].join("\n\n"),
      repository
    ),
    [123]
  );
});

test("references are deduplicated and closing intent is required for each issue", () => {
  assert.deepEqual(
    closingIssueNumbers("Closes #123, closes test/repository#123, resolves #124, #125", repository),
    [123, 124]
  );
  assert.deepEqual(closingIssueNumbers("Closes #2147483647", repository), [2147483647]);
  assert.deepEqual(closingIssueNumbers("", repository), []);
});
