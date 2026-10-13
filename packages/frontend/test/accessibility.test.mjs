import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { useDialogFocus } from "../hooks/use-dialog-focus.ts";
import { noMotion, reducedCollapseVariants, reducedBannerVariants } from "../lib/motion.ts";

function capture(options) {
  let ref;
  function Capture() {
    ref = useDialogFocus(options);
    return null;
  }
  renderToString(React.createElement(Capture));
  return ref;
}
function dom(t) {
  const descriptors = new Map(
    ["document", "HTMLElement", "getComputedStyle"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  t.after(() => {
    for (const [key, value] of descriptors) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  const listeners = new Set();
  const scopes = [];
  const portals = [];
  const document = {
    body: {},
    activeElement: null,
    querySelectorAll: (selector) => (selector === "[data-focus-scope]" ? scopes : portals),
    addEventListener: (event, callback) => {
      assert.equal(event, "keydown");
      listeners.add(callback);
    },
    removeEventListener: (_event, callback) => listeners.delete(callback),
  };
  class Element {
    tabIndex = 0;
    isConnected = true;
    disabled = false;
    hidden = false;
    zIndex = "50";
    children = [];
    initial = null;
    focus() {
      document.activeElement = this;
    }
    matches() {
      return this.disabled;
    }
    closest() {
      return this.hidden ? this : null;
    }
    getClientRects() {
      return this.hidden ? [] : [{}];
    }
    querySelectorAll() {
      return this.children;
    }
    querySelector() {
      return this.initial;
    }
    contains(node) {
      return node === this || this.children.includes(node);
    }
  }
  for (const [key, value] of Object.entries({
    document,
    HTMLElement: Element,
    getComputedStyle: (element) => ({ zIndex: element.zIndex }),
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const tab = (shiftKey = false) => {
    let prevented = false;
    for (const callback of listeners)
      callback({
        key: "Tab",
        shiftKey,
        preventDefault: () => {
          prevented = true;
        },
      });
    return prevented;
  };
  return { Element, document, scopes, portals, listeners, tab };
}

test("modal focus contains forward/backward Tab including portals, skips disabled controls and restores opener", (t) => {
  const d = dom(t);
  const opener = new d.Element();
  opener.focus();
  const modal = new d.Element();
  const first = new d.Element(),
    disabled = new d.Element(),
    last = new d.Element(),
    option = new d.Element();
  disabled.disabled = true;
  modal.children = [first, disabled, last];
  modal.initial = last;
  d.scopes.push(modal);
  const cleanup = capture()(modal);
  assert.equal(d.document.activeElement, last);
  const portal = new d.Element();
  portal.children = [option];
  d.portals.push(portal);
  assert.equal(d.tab(), true);
  assert.equal(d.document.activeElement, option);
  d.tab();
  assert.equal(d.document.activeElement, first);
  d.tab(true);
  assert.equal(d.document.activeElement, option);
  d.tab(true);
  assert.equal(d.document.activeElement, last);
  cleanup();
  // Focus in the modal returns to the real opener, never a disabled child.
  assert.equal(d.document.activeElement, opener);
  assert.equal(d.listeners.size, 0);
});

test("only the top overlay contains Tab; ACT/non-modal surfaces allow keyboard movement", (t) => {
  const d = dom(t);
  const lower = new d.Element();
  lower.children = [new d.Element()];
  d.scopes.push(lower);
  const cleanLower = capture()(lower);
  const upper = new d.Element();
  upper.zIndex = "55";
  upper.children = [new d.Element()];
  d.scopes.push(upper);
  const cleanUpper = capture({ modal: false })(upper);
  assert.equal(d.tab(), false);
  cleanUpper();
  d.scopes.pop();
  assert.equal(d.tab(), true);
  cleanLower();
});

test("modal cleanup preserves focus deliberately moved elsewhere and handles empty/disabled forms", (t) => {
  const d = dom(t);
  const opener = new d.Element();
  opener.focus();
  const modal = new d.Element();
  const disabled = new d.Element();
  disabled.disabled = true;
  modal.children = [disabled];
  d.scopes.push(modal);
  const cleanup = capture()(modal);
  assert.equal(d.document.activeElement, modal);
  d.tab();
  assert.equal(d.document.activeElement, modal);
  const elsewhere = new d.Element();
  elsewhere.focus();
  cleanup();
  assert.equal(d.document.activeElement, elsewhere);
  assert.equal(d.listeners.size, 0);
});

test("reduced-motion geometry has no height/width transition duration", () => {
  assert.equal(noMotion.duration, 0);
  for (const variants of [reducedCollapseVariants, reducedBannerVariants]) {
    assert.equal(variants.hidden.transition.duration, 0);
    assert.equal(variants.visible.transition.duration, 0);
  }
});

test("responsive focus containment follows the viewport without trapping the desktop pane", (t) => {
  const d = dom(t);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let matches = false;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches }) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  });
  const opener = new d.Element();
  opener.focus();
  const panel = new d.Element();
  const first = new d.Element();
  panel.children = [first];
  d.scopes.push(panel);
  const cleanup = capture({ mediaQuery: "(max-width: 800px)" })(panel);
  assert.equal(d.document.activeElement, opener);
  assert.equal(d.tab(), false);
  matches = true;
  assert.equal(d.tab(), true);
  assert.equal(d.document.activeElement, first);
  matches = false;
  assert.equal(d.tab(), false);
  cleanup();
  assert.equal(d.document.activeElement, opener);
});
