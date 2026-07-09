const std = @import("std");

pub const Scope = enum {
    project,
    global,

    pub fn label(self: Scope) []const u8 {
        return switch (self) {
            .project => "Project",
            .global => "Global",
        };
    }

    pub fn badgeVariant(self: Scope) []const u8 {
        return switch (self) {
            .project => "secondary",
            .global => "primary",
        };
    }
};

pub const AgentPath = struct {
    agent: []const u8,
    project: ?[]const u8,
    global: ?[]const u8,
};

pub const agents = [_]AgentPath{
    .{ .agent = "codex", .project = ".agents/skills", .global = ".codex/skills" },
    .{ .agent = "claude-code", .project = ".claude/skills", .global = ".claude/skills" },
    .{ .agent = "cursor", .project = ".agents/skills", .global = ".cursor/skills" },
    .{ .agent = "opencode", .project = ".agents/skills", .global = ".config/opencode/skills" },
    .{ .agent = "gemini-cli", .project = ".agents/skills", .global = ".gemini/skills" },
};

pub fn findAgent(agent: []const u8) ?AgentPath {
    for (agents) |agent_path| {
        if (std.mem.eql(u8, agent_path.agent, agent)) return agent_path;
    }
    return null;
}

pub fn join(allocator: std.mem.Allocator, left: []const u8, right: []const u8) ![]const u8 {
    if (left.len == 0 or std.mem.eql(u8, left, ".")) return allocator.dupe(u8, right);
    if (std.mem.endsWith(u8, left, "/")) return std.fmt.allocPrint(allocator, "{s}{s}", .{ left, right });
    return std.fmt.allocPrint(allocator, "{s}/{s}", .{ left, right });
}

test "finds supported agent path" {
    const agent = findAgent("codex").?;
    try std.testing.expectEqualStrings("codex", agent.agent);
    try std.testing.expectEqualStrings(".agents/skills", agent.project.?);
}
