import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async orig => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
import { ApiError } from "@client/lib/api";
import { loginErrorMessage } from "@client/lib/loginError";
import { Setup } from "@client/pages/Setup";

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

describe("loginErrorMessage", () => {
  it("429 with retry info shows minutes", () => {
    expect(loginErrorMessage(new ApiError(429, "rate_limited", "x", { retryAfter: "600" }))).toBe("ลองผิดหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่");
    expect(loginErrorMessage(new ApiError(429, "rate_limited", "x", { retryAfter: 30 }))).toContain("รอ 1 นาที");
  });
  it("429 without retry info is generic", () => {
    expect(loginErrorMessage(new ApiError(429, "rate_limited", "x", {}))).toBe("ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่");
  });
  it("network failure differs from wrong password", () => {
    expect(loginErrorMessage(new ApiError(0, "network", "ต่ออินเทอร์เน็ตไม่ได้"))).toContain("ต่ออินเทอร์เน็ตไม่ได้");
    expect(loginErrorMessage(new ApiError(401, "unauthorized", "อีเมลหรือรหัสผ่านไม่ถูกต้อง"))).toBe("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  });
});

describe("login form on 429", () => {
  it("shows an alert, keeps the form usable and never echoes the password", async () => {
    post.mockRejectedValue(new ApiError(429, "rate_limited", "ลองผิดหลายครั้ง", { retryAfter: "120" }));
    const { container } = render(<Setup mode="login" />);
    fireEvent.input(container.querySelector("input[type=email]") as HTMLInputElement, { target: { value: "t@example.com" } });
    fireEvent.input(container.querySelector("input[type=password]") as HTMLInputElement, { target: { value: "SecretPw123" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("ลองผิดหลายครั้งเกินไป รอ 2 นาทีแล้วลองใหม่");
    expect(document.body.textContent).not.toContain("SecretPw123");
    await waitFor(() => expect((container.querySelector("button.primary, button[type=submit]") as HTMLButtonElement).disabled).toBe(false));
  });
});
