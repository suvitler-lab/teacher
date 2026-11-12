import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, render, waitFor } from "@testing-library/preact";
import type { Student } from "@shared/types";

// T-42 (AC-102): #/random?class=<id> opens that room; anything unknown falls back to the first room as before.
const get = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));

import { classes, students, settings } from "@client/store";
import { route } from "@client/router";
import { RandomPage } from "@client/pages/Random";

const kid = (n: number, cls: string): Student => ({
  id: cls + "s" + n, code: "10" + n, qr_token: "Q" + cls + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: null,
  class_id: cls, number: n, status: "active", left_at: null, updated_at: 0,
});
const cls = (id: string, name: string, archived = false) => ({ id, name, year: 2569, grade: null, archived }) as never;
const body = () => document.body.textContent ?? "";

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async () => ({ rows: [] }));
  classes.value = [cls("c1", "ป.6/1"), cls("c2", "ป.6/2"), cls("c3", "ป.5/1", true)];
  students.value = [kid(1, "c1"), kid(2, "c1"), kid(1, "c2"), kid(2, "c2"), kid(3, "c2")];
  settings.value = { theme: "light", random_cards: "" } as never;
});

/** the header sub line names the room the page is on */
const roomOnPage = () => document.querySelector(".page-sub, header, h1")?.parentElement?.textContent ?? body();

describe("random page ?class= link", () => {
  it("opens the linked room and asks attendance for that room", async () => {
    route.value = "/random?class=c2";
    render(h(RandomPage, {}));
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(String(get.mock.calls[0][0])).toContain("class=c2");
    expect(roomOnPage()).toContain("ป.6/2");
  });

  it("an unknown or archived room falls back to the first room, without breaking", async () => {
    for (const id of ["nope", "c3"]) {
      get.mockClear();
      route.value = "/random?class=" + id;
      const { unmount } = render(h(RandomPage, {}));
      await waitFor(() => expect(get).toHaveBeenCalled());
      expect(String(get.mock.calls[0][0])).toContain("class=c1");
      unmount();
    }
  });

  it("without the param it still starts on the first room", async () => {
    route.value = "/random";
    render(h(RandomPage, {}));
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(String(get.mock.calls[0][0])).toContain("class=c1");
  });

  it("a link arriving while the page is open switches the room", async () => {
    route.value = "/random";
    render(h(RandomPage, {}));
    await waitFor(() => expect(get).toHaveBeenCalled());
    get.mockClear();
    await act(async () => { route.value = "/random?class=c2"; });
    await waitFor(() => expect(get.mock.calls.some((c) => String(c[0]).includes("class=c2"))).toBe(true));
  });
});
