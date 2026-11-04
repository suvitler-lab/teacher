import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/preact";
import { swrClear } from "../src/lib/swr";

// reset the DOM between tests
afterEach(() => cleanup());
// saved read answers (lib/swr.ts) live in memory: every test starts with none, as a fresh page load would
beforeEach(() => swrClear());
