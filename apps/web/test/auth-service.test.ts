import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { registerOwner, validateCredentials } from "../lib/auth-service";

describe("auth service", () => {
  it("registers a user, hashes the password and creates an owner workspace membership", async () => {
    const create = vi.fn(async ({ data }) => ({
      id: "user_1",
      memberships: [{ organisationId: "org_1", role: "OWNER" }],
      data,
    }));
    const db = {
      user: {
        findUnique: vi.fn(async () => null),
        create,
      },
    };

    const result = await registerOwner(
      { name: "Vishnu", email: "vishnu@example.com", password: "Password123" },
      db as never,
    );

    expect(result).toEqual({
      ok: true,
      userId: "user_1",
      organisationId: "org_1",
      role: "OWNER",
    });
    const data = create.mock.calls[0]?.[0].data;
    expect(data.email).toBe("vishnu@example.com");
    expect(data.passwordHash).not.toBe("Password123");
    expect(await bcrypt.compare("Password123", data.passwordHash)).toBe(true);
    expect(data.memberships.create.role).toBe("OWNER");
    expect(data.memberships.create.organisation.create.name).toBe(
      "Vishnu's Workspace",
    );
  });

  it("prevents duplicate email registration", async () => {
    const db = {
      user: {
        findUnique: vi.fn(async () => ({ id: "existing" })),
        create: vi.fn(),
      },
    };

    const result = await registerOwner(
      { name: "Vishnu", email: "vishnu@example.com", password: "Password123" },
      db as never,
    );

    expect(result).toEqual({
      ok: false,
      message: "An account with this email already exists.",
    });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("validates correct login credentials", async () => {
    const passwordHash = await bcrypt.hash("Password123", 12);
    const db = {
      user: {
        findUnique: vi.fn(async () => ({
          id: "user_1",
          passwordHash,
          memberships: [{ organisationId: "org_1", role: "OWNER" }],
        })),
      },
    };

    await expect(
      validateCredentials(
        { email: "vishnu@example.com", password: "Password123" },
        db as never,
      ),
    ).resolves.toEqual({
      ok: true,
      userId: "user_1",
      organisationId: "org_1",
      role: "OWNER",
    });
  });

  it("rejects invalid login credentials without exposing hashes", async () => {
    const passwordHash = await bcrypt.hash("Password123", 12);
    const db = {
      user: {
        findUnique: vi.fn(async () => ({
          id: "user_1",
          passwordHash,
          memberships: [{ organisationId: "org_1", role: "OWNER" }],
        })),
      },
    };

    await expect(
      validateCredentials(
        { email: "vishnu@example.com", password: "WrongPassword1" },
        db as never,
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Invalid email or password.",
    });
  });
});
