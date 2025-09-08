/**
 * Unit test for lora selection event mapping
 */

/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');
// Polyfill TextEncoder/TextDecoder for jsdom in some Node versions
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Load loraGallery implementation from template file (extract function body)
const templatePath = path.resolve(__dirname, '../../app/frontend/templates/pages/loras.html');
const template = fs.readFileSync(templatePath, 'utf8');

// Extract the loraGallery function definition from the template
const fnMatch = template.match(/function loraGallery\s*\(\)\s*\{([\s\S]*?)\n\}\n/);
let loraGalleryFnSource = null;
if (fnMatch) {
  loraGalleryFnSource = fnMatch[0];
} else {
  throw new Error('Could not extract loraGallery function from template');
}

// Create a sandboxed function and evaluate it
const { JSDOM } = require('jsdom');

function setupDom() {
  const dom = new JSDOM(`<!doctype html><html><body><div id="lora-root"></div></body></html>`, { runScripts: 'outside-only' });
  global.document = dom.window.document;
  global.window = dom.window;
  global.HTMLElement = dom.window.HTMLElement;
}

beforeEach(() => {
  setupDom();
});

test('loraGallery updates selectedLoras on lora-selected / lora-deselected events', () => {
  // Evaluate the function in the JSDOM window context
  const vm = new Function('window', 'document', `${loraGalleryFnSource}; return loraGallery;`);
  const loraGallery = vm(global.window, global.document)();
  // Provide minimal Alpine stubs used by the component (e.g., $watch)
  loraGallery.$watch = function() {};
  if (typeof loraGallery.init === 'function') loraGallery.init();

  // Attach to a dummy element to emulate Alpine.$data semantics (not needed here)
  expect(Array.isArray(loraGallery.selectedLoras)).toBe(true);

  // Dispatch lora-selected event
  const selectEvent = new global.window.CustomEvent('lora-selected', { detail: { id: 'abc-1' } });
  global.window.document.dispatchEvent(selectEvent);
  // Allow any synchronous handlers to run
  expect(loraGallery.selectedLoras.includes('abc-1')).toBe(true);

  // Dispatch lora-deselected
  const deselectEvent = new global.window.CustomEvent('lora-deselected', { detail: { id: 'abc-1' } });
  global.window.document.dispatchEvent(deselectEvent);
  expect(loraGallery.selectedLoras.includes('abc-1')).toBe(false);
});
