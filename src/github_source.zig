const std = @import("std");

pub const Source = struct {
    owner: []const u8,
    repo: []const u8,
    ref: []const u8 = "main",
    subpath: []const u8 = "",
};

pub fn parse(input: []const u8, selected_path: []const u8) !Source {
    const trimmed = std.mem.trim(u8, input, " \t\r\n");
    if (trimmed.len == 0) return error.EmptySource;

    var source = if (std.mem.startsWith(u8, trimmed, "https://github.com/"))
        try parseGithubUrl(trimmed)
    else
        try parseShorthand(trimmed);

    if (selected_path.len != 0) {
        source.subpath = std.mem.trim(u8, selected_path, " \t\r\n/");
    }
    return source;
}

pub fn treeApiUrl(allocator: std.mem.Allocator, source: Source) ![]const u8 {
    if (source.subpath.len == 0) {
        return std.fmt.allocPrint(allocator, "https://api.github.com/repos/{s}/{s}/git/trees/{s}?recursive=1", .{
            source.owner,
            source.repo,
            source.ref,
        });
    }
    return std.fmt.allocPrint(allocator, "https://api.github.com/repos/{s}/{s}/git/trees/{s}:{s}?recursive=1", .{
        source.owner,
        source.repo,
        source.ref,
        source.subpath,
    });
}

pub fn rawUrl(allocator: std.mem.Allocator, source: Source, path: []const u8) ![]const u8 {
    return std.fmt.allocPrint(allocator, "https://raw.githubusercontent.com/{s}/{s}/{s}/{s}", .{
        source.owner,
        source.repo,
        source.ref,
        path,
    });
}

fn parseShorthand(input: []const u8) !Source {
    var parts = std.mem.splitScalar(u8, input, '/');
    const owner = parts.next() orelse return error.InvalidSource;
    const repo = parts.next() orelse return error.InvalidSource;
    if (owner.len == 0 or repo.len == 0) return error.InvalidSource;

    var source: Source = .{ .owner = owner, .repo = repo };
    if (parts.next()) |first_path| {
        source.subpath = input[first_path.ptr - input.ptr ..];
    }
    return source;
}

fn parseGithubUrl(input: []const u8) !Source {
    const prefix = "https://github.com/";
    const rest = input[prefix.len..];
    var parts = std.mem.splitScalar(u8, rest, '/');
    const owner = parts.next() orelse return error.InvalidSource;
    const repo = parts.next() orelse return error.InvalidSource;
    if (owner.len == 0 or repo.len == 0) return error.InvalidSource;

    var source: Source = .{ .owner = owner, .repo = repo };
    const marker = parts.next() orelse return source;
    if (std.mem.eql(u8, marker, "tree") or std.mem.eql(u8, marker, "blob")) {
        source.ref = parts.next() orelse return error.InvalidSource;
        if (parts.next()) |first_path| {
            source.subpath = input[first_path.ptr - input.ptr ..];
        }
    }
    return source;
}

test "parses owner repo shorthand" {
    const source = try parse("vercel-labs/agent-skills", "");
    try std.testing.expectEqualStrings("vercel-labs", source.owner);
    try std.testing.expectEqualStrings("agent-skills", source.repo);
    try std.testing.expectEqualStrings("main", source.ref);
    try std.testing.expectEqualStrings("", source.subpath);
}

test "parses github tree url with subpath" {
    const source = try parse("https://github.com/vercel-labs/agent-skills/tree/main/skills/find-docs", "");
    try std.testing.expectEqualStrings("vercel-labs", source.owner);
    try std.testing.expectEqualStrings("agent-skills", source.repo);
    try std.testing.expectEqualStrings("main", source.ref);
    try std.testing.expectEqualStrings("skills/find-docs", source.subpath);
}

test "selected path overrides source path" {
    const source = try parse("vercel-labs/agent-skills", "skills/native-sdk");
    try std.testing.expectEqualStrings("skills/native-sdk", source.subpath);
}

test "builds github tree and raw urls" {
    const source = try parse("vercel-labs/agent-skills", "skills/find-docs");
    const tree = try treeApiUrl(std.testing.allocator, source);
    defer std.testing.allocator.free(tree);
    const raw = try rawUrl(std.testing.allocator, source, "skills/find-docs/SKILL.md");
    defer std.testing.allocator.free(raw);
    try std.testing.expectEqualStrings("https://api.github.com/repos/vercel-labs/agent-skills/git/trees/main:skills/find-docs?recursive=1", tree);
    try std.testing.expectEqualStrings("https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/find-docs/SKILL.md", raw);
}
