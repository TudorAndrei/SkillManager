const std = @import("std");
const github_source = @import("github_source.zig");
const skill_manifest = @import("skill_manifest.zig");
const skill_paths = @import("skill_paths.zig");

pub const max_skills = 128;
const max_skill_file_bytes = 128 * 1024;

pub const SkillRecord = struct {
    id: []const u8 = "",
    name: []const u8 = "",
    description: []const u8 = "",
    scope: []const u8 = "",
    scope_variant: []const u8 = "secondary",
    agent: []const u8 = "",
    path_hint: []const u8 = "",
    source: []const u8 = "",
};

pub const ScanResult = struct {
    total: usize = 0,
    project: usize = 0,
    global: usize = 0,
};

pub const InstallOptions = struct {
    source: []const u8,
    skill_subpath: []const u8 = "",
    agent: []const u8,
    scope: skill_paths.Scope,
    project_root: []const u8,
    home: []const u8,
};

pub const GithubInstallOptions = struct {
    source: github_source.Source,
    agent: []const u8,
    scope: skill_paths.Scope,
    project_root: []const u8,
    home: []const u8,
};

pub const InstallResult = struct {
    name: []const u8,
    destination: []const u8,
};

pub const GithubSkillCandidate = struct {
    path: []const u8,
    name: []const u8,
};

pub const RemoveOptions = struct {
    skill_path: []const u8,
    agent: []const u8,
    project_root: []const u8,
    home: []const u8,
};

pub const UpdateOptions = RemoveOptions;

pub fn scanInstalled(
    allocator: std.mem.Allocator,
    io: std.Io,
    project_root: []const u8,
    home: []const u8,
    records: *[max_skills]SkillRecord,
) ScanResult {
    var result: ScanResult = .{};
    for (records) |*record| record.* = .{};
    var seen_roots: [skill_paths.agents.len * 2][]const u8 = undefined;
    var seen_root_count: usize = 0;
    defer {
        for (seen_roots[0..seen_root_count]) |root| allocator.free(root);
    }

    for (skill_paths.agents) |agent_path| {
        if (agent_path.project) |relative| {
            const root = skill_paths.join(allocator, project_root, relative) catch continue;
            if (hasSeenRoot(seen_roots[0..seen_root_count], root)) {
                allocator.free(root);
                continue;
            }
            seen_roots[seen_root_count] = root;
            seen_root_count += 1;
            scanRoot(allocator, io, root, agent_path.agent, .project, records, &result);
        }
        if (agent_path.global) |relative| {
            const root = skill_paths.join(allocator, home, relative) catch continue;
            if (hasSeenRoot(seen_roots[0..seen_root_count], root)) {
                allocator.free(root);
                continue;
            }
            seen_roots[seen_root_count] = root;
            seen_root_count += 1;
            scanRoot(allocator, io, root, agent_path.agent, .global, records, &result);
        }
    }
    return result;
}

fn hasSeenRoot(seen_roots: []const []const u8, root: []const u8) bool {
    for (seen_roots) |seen| {
        if (std.mem.eql(u8, seen, root)) return true;
    }
    return false;
}

pub fn installLocal(allocator: std.mem.Allocator, io: std.Io, options: InstallOptions) !InstallResult {
    if (options.source.len == 0) return error.MissingSource;
    if (std.fs.path.isAbsolute(options.skill_subpath) or containsParentTraversal(options.skill_subpath)) return error.UnsafePath;

    const source_dir_path = if (options.skill_subpath.len == 0)
        try allocator.dupe(u8, options.source)
    else
        try skill_paths.join(allocator, options.source, options.skill_subpath);
    defer allocator.free(source_dir_path);

    var source_dir = try openAnyDir(io, source_dir_path, .{ .iterate = true });
    defer source_dir.close(io);

    const manifest_bytes = try source_dir.readFileAlloc(io, "SKILL.md", allocator, .limited(max_skill_file_bytes));
    defer allocator.free(manifest_bytes);
    const parsed = skill_manifest.parse(manifest_bytes);
    const skill_name = parsed.name orelse std.fs.path.basename(source_dir_path);
    const safe_name = try sanitizeName(allocator, skill_name);
    defer allocator.free(safe_name);

    const destination_root = try destinationRoot(allocator, options.agent, options.scope, options.project_root, options.home);
    defer allocator.free(destination_root);
    try std.Io.Dir.cwd().createDirPath(io, destination_root);

    const destination = try skill_paths.join(allocator, destination_root, safe_name);
    try std.Io.Dir.cwd().deleteTree(io, destination);
    try std.Io.Dir.cwd().createDirPath(io, destination);
    try copyDirectory(allocator, io, source_dir_path, destination);
    try writeReceipt(allocator, io, destination, options, skill_name);

    return .{
        .name = try allocator.dupe(u8, skill_name),
        .destination = destination,
    };
}

pub fn installGithub(allocator: std.mem.Allocator, io: std.Io, options: GithubInstallOptions) !InstallResult {
    if (options.source.subpath.len == 0) return error.MissingSkillPath;

    const destination_root = try destinationRoot(allocator, options.agent, options.scope, options.project_root, options.home);
    defer allocator.free(destination_root);
    try std.Io.Dir.cwd().createDirPath(io, destination_root);

    const skill_name = std.fs.path.basename(options.source.subpath);
    const destination = try skill_paths.join(allocator, destination_root, skill_name);
    try std.Io.Dir.cwd().deleteTree(io, destination);
    try std.Io.Dir.cwd().createDirPath(io, destination);

    const tree_url = try github_source.treeApiUrl(allocator, options.source);
    defer allocator.free(tree_url);
    const tree_body = try fetchUrl(allocator, io, tree_url);
    defer allocator.free(tree_body);

    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, tree_body, .{});
    defer parsed.deinit();
    const tree = parsed.value.object.get("tree") orelse return error.InvalidGithubResponse;
    if (tree != .array) return error.InvalidGithubResponse;

    var fetched_files: usize = 0;
    for (tree.array.items) |entry| {
        if (entry != .object) continue;
        const path_value = entry.object.get("path") orelse continue;
        const type_value = entry.object.get("type") orelse continue;
        if (path_value != .string or type_value != .string) continue;
        if (!std.mem.eql(u8, type_value.string, "blob")) continue;

        const relative_path = path_value.string;
        const full_raw_path = if (options.source.subpath.len == 0)
            relative_path
        else
            try skill_paths.join(allocator, options.source.subpath, relative_path);
        defer if (options.source.subpath.len != 0) allocator.free(full_raw_path);

        const raw_url = try github_source.rawUrl(allocator, options.source, full_raw_path);
        defer allocator.free(raw_url);
        const raw_body = try fetchUrl(allocator, io, raw_url);
        defer allocator.free(raw_body);

        const destination_file = try skill_paths.join(allocator, destination, relative_path);
        defer allocator.free(destination_file);
        try writeFetchedFile(io, destination_file, raw_body);
        fetched_files += 1;
    }

    if (fetched_files == 0) return error.EmptyGithubTree;
    const manifest_path = try skill_paths.join(allocator, destination, "SKILL.md");
    defer allocator.free(manifest_path);
    try std.Io.Dir.cwd().access(io, manifest_path, .{});
    try writeGithubReceipt(allocator, io, destination, options, skill_name);

    return .{
        .name = try allocator.dupe(u8, skill_name),
        .destination = destination,
    };
}

pub fn discoverGithubSkills(
    allocator: std.mem.Allocator,
    io: std.Io,
    source: github_source.Source,
    candidates: []GithubSkillCandidate,
) !usize {
    const tree_url = try github_source.treeApiUrl(allocator, source);
    defer allocator.free(tree_url);
    const tree_body = try fetchUrl(allocator, io, tree_url);
    defer allocator.free(tree_body);

    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, tree_body, .{});
    defer parsed.deinit();
    const tree = parsed.value.object.get("tree") orelse return error.InvalidGithubResponse;
    if (tree != .array) return error.InvalidGithubResponse;

    var count: usize = 0;
    for (tree.array.items) |entry| {
        if (count >= candidates.len) break;
        if (entry != .object) continue;
        const path_value = entry.object.get("path") orelse continue;
        const type_value = entry.object.get("type") orelse continue;
        if (path_value != .string or type_value != .string) continue;
        if (!std.mem.eql(u8, type_value.string, "blob")) continue;
        if (!std.mem.endsWith(u8, path_value.string, "SKILL.md")) continue;
        if (path_value.string.len > "SKILL.md".len and path_value.string[path_value.string.len - "SKILL.md".len - 1] != '/') continue;

        const relative_dir = std.mem.trim(u8, path_value.string[0 .. path_value.string.len - "SKILL.md".len], "/");
        if (relative_dir.len == 0 and source.subpath.len == 0) continue;

        const candidate_path = if (source.subpath.len == 0)
            try allocator.dupe(u8, relative_dir)
        else if (relative_dir.len == 0)
            try allocator.dupe(u8, source.subpath)
        else
            try skill_paths.join(allocator, source.subpath, relative_dir);
        errdefer allocator.free(candidate_path);

        const candidate_name = if (relative_dir.len == 0)
            std.fs.path.basename(source.subpath)
        else
            std.fs.path.basename(relative_dir);
        if (candidate_name.len == 0) {
            allocator.free(candidate_path);
            continue;
        }

        candidates[count] = .{
            .path = candidate_path,
            .name = try allocator.dupe(u8, candidate_name),
        };
        count += 1;
    }
    return count;
}

pub fn removeInstalled(allocator: std.mem.Allocator, io: std.Io, options: RemoveOptions) !void {
    if (options.skill_path.len == 0) return error.MissingPath;
    if (!try isKnownSkillPath(allocator, options)) return error.UnsafePath;
    try std.Io.Dir.cwd().deleteTree(io, options.skill_path);
}

pub fn updateInstalled(allocator: std.mem.Allocator, io: std.Io, options: UpdateOptions) !InstallResult {
    if (options.skill_path.len == 0) return error.MissingPath;
    if (!try isKnownSkillPath(allocator, options)) return error.UnsafePath;

    const receipt_path = try skill_paths.join(allocator, options.skill_path, ".skillmanager.json");
    defer allocator.free(receipt_path);
    const receipt_bytes = try std.Io.Dir.cwd().readFileAlloc(io, receipt_path, allocator, .limited(64 * 1024));
    defer allocator.free(receipt_bytes);

    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, receipt_bytes, .{});
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidReceipt;
    const source_type = requiredString(parsed.value.object.get("source_type")) orelse return error.InvalidReceipt;
    const scope_label = requiredString(parsed.value.object.get("scope")) orelse return error.InvalidReceipt;
    const scope = scopeFromLabel(scope_label) orelse return error.InvalidReceipt;

    if (std.mem.eql(u8, source_type, "local")) {
        const source = requiredString(parsed.value.object.get("source")) orelse return error.InvalidReceipt;
        const skill_subpath = requiredString(parsed.value.object.get("skill_subpath")) orelse "";
        return installLocal(allocator, io, .{
            .source = source,
            .skill_subpath = skill_subpath,
            .agent = options.agent,
            .scope = scope,
            .project_root = options.project_root,
            .home = options.home,
        });
    }

    if (std.mem.eql(u8, source_type, "github")) {
        const owner = requiredString(parsed.value.object.get("owner")) orelse return error.InvalidReceipt;
        const repo = requiredString(parsed.value.object.get("repo")) orelse return error.InvalidReceipt;
        const ref = requiredString(parsed.value.object.get("ref")) orelse return error.InvalidReceipt;
        const subpath = requiredString(parsed.value.object.get("subpath")) orelse return error.InvalidReceipt;
        return installGithub(allocator, io, .{
            .source = .{ .owner = owner, .repo = repo, .ref = ref, .subpath = subpath },
            .agent = options.agent,
            .scope = scope,
            .project_root = options.project_root,
            .home = options.home,
        });
    }

    return error.InvalidReceipt;
}

fn scanRoot(
    allocator: std.mem.Allocator,
    io: std.Io,
    root_path: []const u8,
    agent: []const u8,
    scope: skill_paths.Scope,
    records: *[max_skills]SkillRecord,
    result: *ScanResult,
) void {
    if (result.total >= records.len) return;

    var root = if (std.fs.path.isAbsolute(root_path))
        std.Io.Dir.openDirAbsolute(io, root_path, .{ .iterate = true }) catch return
    else
        std.Io.Dir.cwd().openDir(io, root_path, .{ .iterate = true }) catch return;
    defer root.close(io);

    var walker = root.walk(allocator) catch return;
    defer walker.deinit();

    while (walker.next(io) catch null) |entry| {
        if (result.total >= records.len) return;
        if (entry.kind != .file) continue;
        if (!std.mem.eql(u8, entry.basename, "SKILL.md")) continue;
        appendRecord(allocator, io, root_path, entry.path, entry.dir, entry.basename, agent, scope, records, result) catch continue;
    }
}

fn destinationRoot(
    allocator: std.mem.Allocator,
    agent: []const u8,
    scope: skill_paths.Scope,
    project_root: []const u8,
    home: []const u8,
) ![]const u8 {
    const selected = skill_paths.findAgent(agent) orelse return error.UnsupportedAgent;
    const relative = switch (scope) {
        .project => selected.project orelse return error.UnsupportedScope,
        .global => selected.global orelse return error.UnsupportedScope,
    };
    return switch (scope) {
        .project => skill_paths.join(allocator, project_root, relative),
        .global => skill_paths.join(allocator, home, relative),
    };
}

fn copyDirectory(allocator: std.mem.Allocator, io: std.Io, source_path: []const u8, destination_path: []const u8) !void {
    var source = try openAnyDir(io, source_path, .{ .iterate = true });
    defer source.close(io);

    var walker = try source.walk(allocator);
    defer walker.deinit();

    while (try walker.next(io)) |entry| {
        const destination_entry = try skill_paths.join(allocator, destination_path, entry.path);
        defer allocator.free(destination_entry);

        switch (entry.kind) {
            .directory => try std.Io.Dir.cwd().createDirPath(io, destination_entry),
            .file, .sym_link => _ = try std.Io.Dir.updateFile(source, io, entry.path, .cwd(), destination_entry, .{}),
            else => {},
        }
    }
}

fn writeReceipt(
    allocator: std.mem.Allocator,
    io: std.Io,
    destination_path: []const u8,
    options: InstallOptions,
    skill_name: []const u8,
) !void {
    const receipt_path = try skill_paths.join(allocator, destination_path, ".skillmanager.json");
    defer allocator.free(receipt_path);
    const receipt = try std.fmt.allocPrint(allocator,
        \\{{
        \\  "managed_by": "SkillManager",
        \\  "source_type": "local",
        \\  "source": "{s}",
        \\  "skill_subpath": "{s}",
        \\  "name": "{s}",
        \\  "agent": "{s}",
        \\  "scope": "{s}"
        \\}}
        \\
    , .{ options.source, options.skill_subpath, skill_name, options.agent, options.scope.label() });
    defer allocator.free(receipt);
    try std.Io.Dir.cwd().writeFile(io, .{ .sub_path = receipt_path, .data = receipt });
}

fn writeGithubReceipt(
    allocator: std.mem.Allocator,
    io: std.Io,
    destination_path: []const u8,
    options: GithubInstallOptions,
    skill_name: []const u8,
) !void {
    const receipt_path = try skill_paths.join(allocator, destination_path, ".skillmanager.json");
    defer allocator.free(receipt_path);
    const receipt = try std.fmt.allocPrint(allocator,
        \\{{
        \\  "managed_by": "SkillManager",
        \\  "source_type": "github",
        \\  "owner": "{s}",
        \\  "repo": "{s}",
        \\  "ref": "{s}",
        \\  "subpath": "{s}",
        \\  "name": "{s}",
        \\  "agent": "{s}",
        \\  "scope": "{s}"
        \\}}
        \\
    , .{ options.source.owner, options.source.repo, options.source.ref, options.source.subpath, skill_name, options.agent, options.scope.label() });
    defer allocator.free(receipt);
    try std.Io.Dir.cwd().writeFile(io, .{ .sub_path = receipt_path, .data = receipt });
}

fn fetchUrl(allocator: std.mem.Allocator, io: std.Io, url: []const u8) ![]u8 {
    var client: std.http.Client = .{ .allocator = allocator, .io = io };
    defer client.deinit();
    var body: std.Io.Writer.Allocating = .init(allocator);
    errdefer body.deinit();
    const result = try client.fetch(.{
        .location = .{ .url = url },
        .response_writer = &body.writer,
        .headers = .{ .user_agent = .{ .override = "SkillManager" } },
    });
    if (result.status != .ok) return error.HttpStatusNotOk;
    return body.toOwnedSlice();
}

fn writeFetchedFile(io: std.Io, destination_file: []const u8, data: []const u8) !void {
    if (std.fs.path.dirname(destination_file)) |parent| {
        try std.Io.Dir.cwd().createDirPath(io, parent);
    }
    try std.Io.Dir.cwd().writeFile(io, .{ .sub_path = destination_file, .data = data });
}

fn requiredString(value: ?std.json.Value) ?[]const u8 {
    const concrete = value orelse return null;
    return switch (concrete) {
        .string => |string| string,
        else => null,
    };
}

fn scopeFromLabel(label: []const u8) ?skill_paths.Scope {
    if (std.mem.eql(u8, label, "Project")) return .project;
    if (std.mem.eql(u8, label, "Global")) return .global;
    return null;
}

fn isKnownSkillPath(allocator: std.mem.Allocator, options: RemoveOptions) !bool {
    for (skill_paths.agents) |agent_path| {
        if (!std.mem.eql(u8, agent_path.agent, options.agent)) continue;
        if (agent_path.project) |relative| {
            const root = try skill_paths.join(allocator, options.project_root, relative);
            defer allocator.free(root);
            if (isPathInside(options.skill_path, root)) return true;
        }
        if (agent_path.global) |relative| {
            const root = try skill_paths.join(allocator, options.home, relative);
            defer allocator.free(root);
            if (isPathInside(options.skill_path, root)) return true;
        }
    }
    return false;
}

fn openAnyDir(io: std.Io, path: []const u8, options: std.Io.Dir.OpenOptions) !std.Io.Dir {
    return if (std.fs.path.isAbsolute(path))
        std.Io.Dir.openDirAbsolute(io, path, options)
    else
        std.Io.Dir.cwd().openDir(io, path, options);
}

fn sanitizeName(allocator: std.mem.Allocator, name: []const u8) ![]const u8 {
    var result = try allocator.alloc(u8, name.len);
    for (name, 0..) |char, index| {
        result[index] = switch (char) {
            '/', '\\', ':', 0...31 => '-',
            else => char,
        };
    }
    return result;
}

fn containsParentTraversal(path: []const u8) bool {
    var parts = std.mem.tokenizeAny(u8, path, "/\\");
    while (parts.next()) |part| {
        if (std.mem.eql(u8, part, "..")) return true;
    }
    return false;
}

fn isPathInside(path: []const u8, root: []const u8) bool {
    if (std.mem.eql(u8, path, root)) return false;
    if (!std.mem.startsWith(u8, path, root)) return false;
    return path.len > root.len and path[root.len] == '/';
}

fn appendRecord(
    allocator: std.mem.Allocator,
    io: std.Io,
    root_path: []const u8,
    skill_file_path: []const u8,
    containing_dir: std.Io.Dir,
    basename: []const u8,
    agent: []const u8,
    scope: skill_paths.Scope,
    records: *[max_skills]SkillRecord,
    result: *ScanResult,
) !void {
    const bytes = try containing_dir.readFileAlloc(io, basename, allocator, .limited(max_skill_file_bytes));
    const parsed = skill_manifest.parse(bytes);
    const skill_dir_rel = std.fs.path.dirname(skill_file_path) orelse ".";
    const skill_dir_name = if (std.mem.eql(u8, skill_dir_rel, "."))
        std.fs.path.basename(root_path)
    else
        std.fs.path.basename(skill_dir_rel);
    const name = parsed.name orelse skill_dir_name;
    const description = parsed.description orelse "No description in SKILL.md.";
    const path_hint = try skill_paths.join(allocator, root_path, skill_dir_rel);
    const source = readReceiptLabel(allocator, io, containing_dir) catch try allocator.dupe(u8, "installed");

    const index = result.total;
    records[index] = .{
        .id = try std.fmt.allocPrint(allocator, "{s}:{s}:{s}", .{ scope.label(), agent, path_hint }),
        .name = try allocator.dupe(u8, name),
        .description = try allocator.dupe(u8, description),
        .scope = scope.label(),
        .scope_variant = scope.badgeVariant(),
        .agent = try allocator.dupe(u8, agent),
        .path_hint = path_hint,
        .source = source,
    };
    result.total += 1;
    switch (scope) {
        .project => result.project += 1,
        .global => result.global += 1,
    }
}

fn readReceiptLabel(allocator: std.mem.Allocator, io: std.Io, containing_dir: std.Io.Dir) ![]const u8 {
    const bytes = try containing_dir.readFileAlloc(io, ".skillmanager.json", allocator, .limited(64 * 1024));
    defer allocator.free(bytes);
    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, bytes, .{});
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidReceipt;
    const source_type = requiredString(parsed.value.object.get("source_type")) orelse return error.InvalidReceipt;
    if (std.mem.eql(u8, source_type, "local")) {
        const source = requiredString(parsed.value.object.get("source")) orelse return error.InvalidReceipt;
        return std.fmt.allocPrint(allocator, "local:{s}", .{source});
    }
    if (std.mem.eql(u8, source_type, "github")) {
        const owner = requiredString(parsed.value.object.get("owner")) orelse return error.InvalidReceipt;
        const repo = requiredString(parsed.value.object.get("repo")) orelse return error.InvalidReceipt;
        const subpath = requiredString(parsed.value.object.get("subpath")) orelse return error.InvalidReceipt;
        return std.fmt.allocPrint(allocator, "github:{s}/{s}:{s}", .{ owner, repo, subpath });
    }
    return error.InvalidReceipt;
}

test "scan ignores missing roots" {
    var records: [max_skills]SkillRecord = undefined;
    const result = scanInstalled(std.testing.allocator, std.testing.io, ".zig-cache/no-such-project", ".zig-cache/no-such-home", &records);
    try std.testing.expectEqual(@as(usize, 0), result.total);
}

test "local install writes skill and receipt, then safe remove deletes it" {
    const io = std.testing.io;
    const allocator = std.testing.allocator;
    const src_root = ".zig-cache/skillmanager-test-src";
    const project_root = ".zig-cache/skillmanager-test-project";
    const home = ".zig-cache/skillmanager-test-home";

    std.Io.Dir.cwd().deleteTree(io, src_root) catch {};
    std.Io.Dir.cwd().deleteTree(io, project_root) catch {};
    std.Io.Dir.cwd().deleteTree(io, home) catch {};
    defer std.Io.Dir.cwd().deleteTree(io, src_root) catch {};
    defer std.Io.Dir.cwd().deleteTree(io, project_root) catch {};
    defer std.Io.Dir.cwd().deleteTree(io, home) catch {};

    try std.Io.Dir.cwd().createDirPath(io, src_root);
    try std.Io.Dir.cwd().writeFile(io, .{
        .sub_path = src_root ++ "/SKILL.md",
        .data = "---\nname: local-fixture\ndescription: Local fixture\n---\n",
    });

    const installed = try installLocal(allocator, io, .{
        .source = src_root,
        .agent = "codex",
        .scope = .project,
        .project_root = project_root,
        .home = home,
    });
    defer allocator.free(installed.name);
    defer allocator.free(installed.destination);

    try std.Io.Dir.cwd().access(io, project_root ++ "/.agents/skills/local-fixture/SKILL.md", .{});
    try std.Io.Dir.cwd().access(io, project_root ++ "/.agents/skills/local-fixture/.skillmanager.json", .{});
    try std.Io.Dir.cwd().writeFile(io, .{
        .sub_path = src_root ++ "/extra.txt",
        .data = "updated\n",
    });

    const updated = try updateInstalled(allocator, io, .{
        .skill_path = installed.destination,
        .agent = "codex",
        .project_root = project_root,
        .home = home,
    });
    defer allocator.free(updated.name);
    defer allocator.free(updated.destination);
    try std.Io.Dir.cwd().access(io, project_root ++ "/.agents/skills/local-fixture/extra.txt", .{});
    var records: [max_skills]SkillRecord = undefined;
    const scan = scanInstalled(std.heap.page_allocator, io, project_root, home, &records);
    try std.testing.expectEqual(@as(usize, 1), scan.total);
    try std.testing.expectEqualStrings("local:" ++ src_root, records[0].source);

    try std.testing.expectError(error.UnsafePath, removeInstalled(allocator, io, .{
        .skill_path = src_root,
        .agent = "codex",
        .project_root = project_root,
        .home = home,
    }));

    try removeInstalled(allocator, io, .{
        .skill_path = updated.destination,
        .agent = "codex",
        .project_root = project_root,
        .home = home,
    });
    try std.testing.expectError(error.FileNotFound, std.Io.Dir.cwd().access(io, project_root ++ "/.agents/skills/local-fixture/SKILL.md", .{}));
}
