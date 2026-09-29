import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/preact";

// reset the DOM between tests
afterEach(() => cleanup());
