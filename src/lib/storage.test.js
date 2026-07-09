import { describe, it, expect } from "vitest";
import { newerOf } from "./storage.js";

// newerOf is the pure last-write-wins tie-break shared by loadState (local vs
// cloud) and, conceptually, by the "Sync now" guard. A regression here silently
// resurrects stale data, so it's worth pinning down on its own.

describe("newerOf", () => {
  it("returns the other side when one is null/undefined", () => {
    expect(newerOf(null, { _updatedAt: 5 })).toEqual({ _updatedAt: 5 });
    expect(newerOf({ _updatedAt: 5 }, null)).toEqual({ _updatedAt: 5 });
    expect(newerOf(null, null)).toBeNull();
    expect(newerOf(undefined, undefined)).toBeNull();
  });

  it("picks the blob with the newer _updatedAt regardless of argument order", () => {
    const older = { _updatedAt: 100, tag: "old" };
    const newer = { _updatedAt: 200, tag: "new" };
    expect(newerOf(older, newer).tag).toBe("new");
    expect(newerOf(newer, older).tag).toBe("new");
  });

  it("treats a missing stamp as oldest", () => {
    const stamped = { _updatedAt: 1, tag: "stamped" };
    const unstamped = { tag: "unstamped" };
    expect(newerOf(unstamped, stamped).tag).toBe("stamped");
    expect(newerOf(stamped, unstamped).tag).toBe("stamped");
  });

  it("breaks an exact tie toward the first argument (pass local first)", () => {
    const local = { _updatedAt: 10, tag: "local" };
    const cloud = { _updatedAt: 10, tag: "cloud" };
    expect(newerOf(local, cloud).tag).toBe("local");
  });
});
