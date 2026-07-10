const std = @import("std");
const native_sdk = @import("native_sdk");
const canvas = native_sdk.canvas;
const github_source = @import("github_source.zig");
const skill_paths = @import("skill_paths.zig");
const skill_store = @import("skill_store.zig");

pub const Scope = enum { all, project, global };

pub const SkillRow = struct {
    id: []const u8,
    name: []const u8,
    description: []const u8,
    scope: []const u8,
    scope_variant: []const u8,
    agent: []const u8,
    path_hint: []const u8,
    source: []const u8,
    active: bool,
    visible: bool,
};

pub const ActivityRow = struct {
    id: []const u8,
    title: []const u8,
    detail: []const u8,
    icon: []const u8,
    color: []const u8,
};

pub const Model = struct {
    io: ?std.Io = null,
    allocator: std.mem.Allocator = std.heap.page_allocator,
    home: []const u8 = ".",
    search_buffer: canvas.TextBuffer(256) = .{},
    all_filter_variant: []const u8 = "primary",
    project_filter_variant: []const u8 = "secondary",
    global_filter_variant: []const u8 = "secondary",
    scope_filter: []const u8 = "all",
    agent_filter: []const u8 = "codex",
    agent_all_selected: bool = false,
    agent_codex_selected: bool = true,
    agent_cursor_selected: bool = false,
    agent_claude_selected: bool = false,
    install_source_buffer: canvas.TextBuffer(1024) = .{},
    install_skill_buffer: canvas.TextBuffer(512) = .{},
    project_root: []const u8 = ".",
    status_line: []const u8 = "Ready",
    has_error: bool = false,
    error_title: []const u8 = "",
    error_detail: []const u8 = "",
    operation_in_progress: bool = false,
    operation_label: []const u8 = "Idle",
    install_controls_disabled: bool = false,
    selection_controls_disabled: bool = true,
    header_height: f32 = 54,
    chrome_leading: f32 = 76,
    sidebar_split: f32 = 0.23,
    list_split: f32 = 0.38,
    active_skill_id: []const u8 = "frontend-design",
    all_selected: bool = true,
    project_selected: bool = false,
    global_selected: bool = false,
    total_count: usize = 0,
    project_count: usize = 0,
    global_count: usize = 0,
    visible_count: usize = 0,
    list_title: []const u8 = "Installed skills",
    skill_rows: [skill_store.max_skills]SkillRow = emptySkillRows(),
    activity_rows: []const ActivityRow = &default_activity_rows,
    has_active_skill: bool = false,
    active_name: []const u8 = "",
    active_description: []const u8 = "",
    active_scope: []const u8 = "",
    active_scope_variant: []const u8 = "secondary",
    active_agent: []const u8 = "",
    active_path: []const u8 = "",
    active_source: []const u8 = "",

    pub const view_unbound = .{
        "io",
        "allocator",
        "home",
        "scope_filter",
        "agent_filter",
        "active_skill_id",
        "search_buffer",
        "install_source_buffer",
        "install_skill_buffer",
    };

    pub fn search(model: *const Model) []const u8 {
        return model.search_buffer.text();
    }

    pub fn install_source(model: *const Model) []const u8 {
        return model.install_source_buffer.text();
    }

    pub fn install_skill(model: *const Model) []const u8 {
        return model.install_skill_buffer.text();
    }
};

pub fn initialModel(allocator: std.mem.Allocator, io: std.Io, home: []const u8) Model {
    var model = Model{
        .io = io,
        .allocator = allocator,
        .home = home,
    };
    model.install_source_buffer.set("vercel-labs/agent-skills");
    rescan(&model);
    return model;
}

pub const Msg = union(enum) {
    search_edit: canvas.TextInputEvent,
    source_edit: canvas.TextInputEvent,
    install_skill_edit: canvas.TextInputEvent,
    scope_changed: []const u8,
    agent_changed: []const u8,
    sidebar_resized: f32,
    list_resized: f32,
    open_skill: []const u8,
    select_all,
    select_project,
    select_global,
    refresh,
    install,
    install_project,
    install_global,
    update_active,
    remove_active,
    reveal_active,
    select_agent_all,
    select_agent_codex,
    select_agent_cursor,
    select_agent_claude,
    chrome_changed: native_sdk.WindowChrome,
    system_scheme: native_sdk.canvas.ColorScheme,

    pub const view_unbound = .{ "scope_changed", "agent_changed", "chrome_changed", "system_scheme" };
};

pub fn update(model: *Model, msg: Msg) void {
    switch (msg) {
        .search_edit => |event| {
            clearError(model);
            model.search_buffer.apply(event);
            applyFilters(model);
            model.status_line = "Search applied.";
        },
        .source_edit => |event| {
            clearError(model);
            model.install_source_buffer.apply(event);
        },
        .install_skill_edit => |event| {
            clearError(model);
            model.install_skill_buffer.apply(event);
        },
        .scope_changed => |value| {
            model.scope_filter = value;
            applyFilters(model);
        },
        .agent_changed => |value| {
            model.agent_filter = value;
            applyFilters(model);
        },
        .sidebar_resized => |value| model.sidebar_split = value,
        .list_resized => |value| model.list_split = value,
        .open_skill => |id| setActiveSkill(model, id),
        .select_all => setScope(model, "all"),
        .select_project => setScope(model, "project"),
        .select_global => setScope(model, "global"),
        .refresh => {
            clearError(model);
            runOperation(model, "Scanning", rescan);
        },
        .install => {
            clearError(model);
            model.status_line = "Choose Project or Global to install the source.";
        },
        .install_project => installLocalSkill(model, .project),
        .install_global => installLocalSkill(model, .global),
        .update_active => updateActiveSkill(model),
        .remove_active => removeActiveSkill(model),
        .reveal_active => model.status_line = "Reveal requested for selected skill.",
        .select_agent_all => setAgent(model, "all"),
        .select_agent_codex => setAgent(model, "codex"),
        .select_agent_cursor => setAgent(model, "cursor"),
        .select_agent_claude => setAgent(model, "claude-code"),
        .chrome_changed => |chrome| model.chrome_leading = chrome.insets.left,
        .system_scheme => {},
    }
}

fn installLocalSkill(model: *Model, scope: skill_paths.Scope) void {
    beginOperation(model, "Installing");
    defer endOperation(model);
    const io = model.io orelse {
        setError(model, "Install failed", "Filesystem IO is unavailable.");
        return;
    };
    const agent = selectedInstallAgent(model);
    const installed = installFromCurrentSource(model, io, agent, scope) catch |err| {
        setError(model, "Install failed", @errorName(err));
        return;
    };
    rescan(model);
    setActiveSkillByPath(model, installed.destination);
    clearError(model);
    model.status_line = "Installed skill.";
}

fn installFromCurrentSource(model: *Model, io: std.Io, agent: []const u8, scope: skill_paths.Scope) !skill_store.InstallResult {
    return skill_store.installLocal(model.allocator, io, .{
        .source = model.install_source(),
        .skill_subpath = model.install_skill(),
        .agent = agent,
        .scope = scope,
        .project_root = model.project_root,
        .home = model.home,
    }) catch |local_err| {
        if (!looksLikeGithubSource(model.install_source())) return local_err;
        const source = try github_source.parse(model.install_source(), model.install_skill());
        return skill_store.installGithub(model.allocator, io, .{
            .source = source,
            .agent = agent,
            .scope = scope,
            .project_root = model.project_root,
            .home = model.home,
        });
    };
}

fn removeActiveSkill(model: *Model) void {
    beginOperation(model, "Removing");
    defer endOperation(model);
    if (!model.has_active_skill) {
        setError(model, "Remove failed", "No skill selected.");
        return;
    }
    const io = model.io orelse {
        setError(model, "Remove failed", "Filesystem IO is unavailable.");
        return;
    };
    skill_store.removeInstalled(model.allocator, io, .{
        .skill_path = model.active_path,
        .agent = model.active_agent,
        .project_root = model.project_root,
        .home = model.home,
    }) catch |err| {
        setError(model, "Remove failed", @errorName(err));
        return;
    };
    rescan(model);
    clearError(model);
    model.status_line = "Removed selected skill.";
}

fn updateActiveSkill(model: *Model) void {
    beginOperation(model, "Updating");
    defer endOperation(model);
    if (!model.has_active_skill) {
        setError(model, "Update failed", "No skill selected.");
        return;
    }
    const io = model.io orelse {
        setError(model, "Update failed", "Filesystem IO is unavailable.");
        return;
    };
    const updated = skill_store.updateInstalled(model.allocator, io, .{
        .skill_path = model.active_path,
        .agent = model.active_agent,
        .project_root = model.project_root,
        .home = model.home,
    }) catch |err| {
        setError(model, "Update failed", @errorName(err));
        return;
    };
    rescan(model);
    setActiveSkillByPath(model, updated.destination);
    clearError(model);
    model.status_line = "Updated selected skill.";
}

fn runOperation(model: *Model, label: []const u8, operation: fn (*Model) void) void {
    beginOperation(model, label);
    defer endOperation(model);
    operation(model);
}

fn beginOperation(model: *Model, label: []const u8) void {
    model.operation_in_progress = true;
    model.operation_label = label;
    updateControlState(model);
}

fn endOperation(model: *Model) void {
    model.operation_in_progress = false;
    model.operation_label = "Idle";
    updateControlState(model);
}

fn setError(model: *Model, title: []const u8, detail: []const u8) void {
    model.has_error = true;
    model.error_title = title;
    model.error_detail = detail;
    model.status_line = detail;
}

fn clearError(model: *Model) void {
    model.has_error = false;
    model.error_title = "";
    model.error_detail = "";
}

fn selectedInstallAgent(model: *const Model) []const u8 {
    if (model.agent_all_selected) return "codex";
    return model.agent_filter;
}

fn looksLikeGithubSource(source: []const u8) bool {
    if (std.mem.startsWith(u8, source, "https://github.com/")) return true;
    if (std.fs.path.isAbsolute(source)) return false;
    if (std.mem.startsWith(u8, source, ".") or std.mem.startsWith(u8, source, "~")) return false;
    return std.mem.count(u8, source, "/") >= 1;
}

fn setActiveSkillByPath(model: *Model, path: []const u8) void {
    for (&model.skill_rows) |*row| {
        if (row.id.len != 0 and std.mem.eql(u8, row.path_hint, path)) {
            setActiveSkill(model, row.id);
            return;
        }
    }
}

fn setScope(model: *Model, scope: []const u8) void {
    model.scope_filter = scope;
    model.all_selected = std.mem.eql(u8, scope, "all");
    model.project_selected = std.mem.eql(u8, scope, "project");
    model.global_selected = std.mem.eql(u8, scope, "global");
    model.all_filter_variant = if (model.all_selected) "primary" else "secondary";
    model.project_filter_variant = if (model.project_selected) "primary" else "secondary";
    model.global_filter_variant = if (model.global_selected) "primary" else "secondary";
    applyFilters(model);
    if (model.project_selected) {
        model.list_title = "Project skills";
        model.status_line = "Showing project skills.";
    } else if (model.global_selected) {
        model.list_title = "Global skills";
        model.status_line = "Showing global skills.";
    } else {
        model.list_title = "Installed skills";
        model.status_line = "Showing all skills.";
    }
}

fn setAgent(model: *Model, agent: []const u8) void {
    model.agent_filter = agent;
    model.agent_all_selected = std.mem.eql(u8, agent, "all");
    model.agent_codex_selected = std.mem.eql(u8, agent, "codex");
    model.agent_cursor_selected = std.mem.eql(u8, agent, "cursor");
    model.agent_claude_selected = std.mem.eql(u8, agent, "claude-code");
    applyFilters(model);
    model.status_line = if (model.agent_all_selected)
        "Showing all agents."
    else if (model.agent_codex_selected)
        "Showing codex skills."
    else if (model.agent_cursor_selected)
        "Showing cursor skills."
    else
        "Showing claude-code skills.";
}

fn setActiveSkill(model: *Model, id: []const u8) void {
    model.active_skill_id = id;
    for (&model.skill_rows) |*row| {
        row.active = row.visible and std.mem.eql(u8, row.id, id);
        if (row.active) {
            model.has_active_skill = true;
            model.active_name = row.name;
            model.active_description = row.description;
            model.active_scope = row.scope;
            model.active_scope_variant = row.scope_variant;
            model.active_agent = row.agent;
            model.active_path = row.path_hint;
            model.active_source = row.source;
            model.status_line = row.name;
        }
    }
    updateControlState(model);
}

fn applyFilters(model: *Model) void {
    var visible_count: usize = 0;
    var active_visible = false;
    var first_visible_id: ?[]const u8 = null;

    for (&model.skill_rows) |*row| {
        const has_row = row.id.len != 0;
        const scope_matches = model.all_selected or
            (model.project_selected and std.mem.eql(u8, row.scope, "Project")) or
            (model.global_selected and std.mem.eql(u8, row.scope, "Global"));
        const agent_matches = model.agent_all_selected or std.mem.eql(u8, row.agent, model.agent_filter);
        const search = model.search();
        const search_matches = search.len == 0 or
            containsIgnoreCase(row.name, search) or
            containsIgnoreCase(row.description, search) or
            containsIgnoreCase(row.agent, search);
        row.visible = has_row and scope_matches and agent_matches and search_matches;

        if (row.visible) {
            visible_count += 1;
            if (first_visible_id == null) first_visible_id = row.id;
        }

        if (row.visible and std.mem.eql(u8, row.id, model.active_skill_id)) {
            active_visible = true;
        }
    }

    model.visible_count = visible_count;
    if (!active_visible) {
        if (first_visible_id) |id| {
            setActiveSkill(model, id);
        } else {
            clearActiveSkill(model);
        }
    } else {
        setActiveSkill(model, model.active_skill_id);
    }
}

fn containsIgnoreCase(haystack: []const u8, needle: []const u8) bool {
    if (needle.len == 0) return true;
    if (needle.len > haystack.len) return false;

    var index: usize = 0;
    while (index + needle.len <= haystack.len) : (index += 1) {
        if (std.ascii.eqlIgnoreCase(haystack[index .. index + needle.len], needle)) return true;
    }
    return false;
}

fn clearActiveSkill(model: *Model) void {
    model.has_active_skill = false;
    model.active_skill_id = "";
    model.active_name = "";
    model.active_description = "";
    model.active_scope = "";
    model.active_scope_variant = "secondary";
    model.active_agent = "";
    model.active_path = "";
    model.active_source = "";
    for (&model.skill_rows) |*row| row.active = false;
    updateControlState(model);
}

fn rescan(model: *Model) void {
    var records: [skill_store.max_skills]skill_store.SkillRecord = undefined;
    const result = if (model.io) |io|
        skill_store.scanInstalled(model.allocator, io, model.project_root, model.home, &records)
    else
        skill_store.ScanResult{};

    for (&model.skill_rows) |*row| row.* = emptySkillRow();
    for (records[0..result.total], 0..) |record, index| {
        model.skill_rows[index] = .{
            .id = record.id,
            .name = record.name,
            .description = record.description,
            .scope = record.scope,
            .scope_variant = record.scope_variant,
            .agent = record.agent,
            .path_hint = record.path_hint,
            .source = record.source,
            .active = false,
            .visible = true,
        };
    }

    model.total_count = result.total;
    model.project_count = result.project;
    model.global_count = result.global;
    applyFilters(model);
    model.status_line = if (result.total == 0)
        "No installed skills found in known project/global roots."
    else
        "Scanned project and global skill folders.";
    updateControlState(model);
}

fn updateControlState(model: *Model) void {
    model.install_controls_disabled = model.operation_in_progress;
    model.selection_controls_disabled = model.operation_in_progress or !model.has_active_skill;
}

fn emptySkillRows() [skill_store.max_skills]SkillRow {
    return [_]SkillRow{emptySkillRow()} ** skill_store.max_skills;
}

fn emptySkillRow() SkillRow {
    return .{
        .id = "",
        .name = "",
        .description = "",
        .scope = "",
        .scope_variant = "secondary",
        .agent = "",
        .path_hint = "",
        .source = "",
        .active = false,
        .visible = false,
    };
}

pub const default_activity_rows = [_]ActivityRow{
    .{ .id = "native", .title = "Native bridge active", .detail = "The React frontend is connected to the in-process Zig model through policy-checked commands.", .icon = "check-circle", .color = "success" },
    .{ .id = "embedded", .title = "Embedded skill library planned", .detail = "Skill scanning and install/update/remove should run in-process, not through npx skills.", .icon = "terminal", .color = "text_muted" },
};

test "search edits accumulate and filter matching skills" {
    var model = Model{};
    model.skill_rows[0] = .{
        .id = "frontend-design",
        .name = "frontend-design",
        .description = "Build polished interfaces.",
        .scope = "Project",
        .scope_variant = "secondary",
        .agent = "codex",
        .path_hint = "/tmp/frontend-design",
        .source = "installed",
        .active = false,
        .visible = true,
    };
    model.skill_rows[1] = .{
        .id = "find-docs",
        .name = "find-docs",
        .description = "Retrieve current documentation.",
        .scope = "Global",
        .scope_variant = "primary",
        .agent = "claude-code",
        .path_hint = "/tmp/find-docs",
        .source = "installed",
        .active = false,
        .visible = true,
    };

    update(&model, .{ .search_edit = .{ .insert_text = "front" } });
    try std.testing.expectEqualStrings("front", model.search());
    try std.testing.expectEqual(@as(usize, 1), model.visible_count);
    try std.testing.expect(model.skill_rows[0].visible);
    try std.testing.expect(!model.skill_rows[1].visible);

    update(&model, .{ .search_edit = .delete_backward });
    try std.testing.expectEqualStrings("fron", model.search());
    try std.testing.expectEqual(@as(usize, 1), model.visible_count);
}
