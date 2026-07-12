const std = @import("std");
const runner = @import("runner");
const native_sdk = @import("native_sdk");
const model_mod = @import("model.zig");
const github_source = @import("github_source.zig");
const skill_store = @import("skill_store.zig");

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

pub const Model = model_mod.Model;

const bridge_policies = [_]native_sdk.BridgeCommandPolicy{
    .{ .name = "skillmanager.snapshot", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.project", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.search", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.scope", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.agent", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.select", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.refresh", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.install", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.discover", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.update", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
    .{ .name = "skillmanager.remove", .origins = &.{ "zero://app", "http://127.0.0.1:5173" } },
};

const SkillManagerApp = struct {
    env_map: *std.process.Environ.Map,
    model: Model,
    handlers: [bridge_policies.len]native_sdk.BridgeHandler = undefined,

    fn app(self: *@This()) native_sdk.App {
        return .{
            .context = self,
            .name = "skillmanager",
            .source = native_sdk.frontend.productionSource(.{
                .dist = "frontend/dist",
                .entry = "index.html",
            }),
            .source_fn = source,
        };
    }

    fn source(context: *anyopaque) anyerror!native_sdk.WebViewSource {
        const self: *@This() = @ptrCast(@alignCast(context));
        return native_sdk.frontend.sourceFromEnv(self.env_map, .{
            .dist = "frontend/dist",
            .entry = "index.html",
            .origin = "zero://app",
            .spa_fallback = true,
        });
    }

    fn bridge(self: *@This()) native_sdk.BridgeDispatcher {
        self.handlers = .{
            .{ .name = "skillmanager.snapshot", .context = self, .invoke_fn = handleSnapshot },
            .{ .name = "skillmanager.project", .context = self, .invoke_fn = handleProject },
            .{ .name = "skillmanager.search", .context = self, .invoke_fn = handleSearch },
            .{ .name = "skillmanager.scope", .context = self, .invoke_fn = handleScope },
            .{ .name = "skillmanager.agent", .context = self, .invoke_fn = handleAgent },
            .{ .name = "skillmanager.select", .context = self, .invoke_fn = handleSelect },
            .{ .name = "skillmanager.refresh", .context = self, .invoke_fn = handleRefresh },
            .{ .name = "skillmanager.install", .context = self, .invoke_fn = handleInstall },
            .{ .name = "skillmanager.discover", .context = self, .invoke_fn = handleDiscover },
            .{ .name = "skillmanager.update", .context = self, .invoke_fn = handleUpdate },
            .{ .name = "skillmanager.remove", .context = self, .invoke_fn = handleRemove },
        };
        return .{
            .policy = .{ .enabled = true, .commands = &bridge_policies },
            .registry = .{ .handlers = &self.handlers },
        };
    }
};

fn appFromContext(context: *anyopaque) *SkillManagerApp {
    return @ptrCast(@alignCast(context));
}

fn parsePayload(app: *SkillManagerApp, raw: []const u8) !std.json.Parsed(std.json.Value) {
    return std.json.parseFromSlice(std.json.Value, app.model.allocator, raw, .{});
}

fn payloadObject(value: std.json.Value) !std.json.ObjectMap {
    return switch (value) {
        .object => |object| object,
        else => error.InvalidPayload,
    };
}

fn payloadString(object: std.json.ObjectMap, name: []const u8) ![]const u8 {
    const value = object.get(name) orelse return error.MissingField;
    return switch (value) {
        .string => |text| text,
        else => error.InvalidField,
    };
}

fn handleSnapshot(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    return writeSnapshot(&appFromContext(context).model, output);
}

fn handleProject(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    const parsed = try parsePayload(app, invocation.request.payload);
    defer parsed.deinit();
    const path = try payloadString(try payloadObject(parsed.value), "path");
    for (app.model.projects[0..app.model.project_total]) |project| {
        if (std.mem.eql(u8, project.path, path)) {
            model_mod.update(&app.model, .{ .project_changed = project.path });
            return writeSnapshot(&app.model, output);
        }
    }
    return error.UnknownProject;
}

fn handleSearch(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    const parsed = try parsePayload(app, invocation.request.payload);
    defer parsed.deinit();
    const value = try payloadString(try payloadObject(parsed.value), "value");

    model_mod.update(&app.model, .{ .search_edit = .clear });
    if (value.len > 0) model_mod.update(&app.model, .{ .search_edit = .{ .insert_text = value } });
    return writeSnapshot(&app.model, output);
}

fn handleScope(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    const parsed = try parsePayload(app, invocation.request.payload);
    defer parsed.deinit();
    const value = try payloadString(try payloadObject(parsed.value), "value");
    if (std.mem.eql(u8, value, "all")) {
        model_mod.update(&app.model, .select_all);
    } else if (std.mem.eql(u8, value, "project")) {
        model_mod.update(&app.model, .select_project);
    } else if (std.mem.eql(u8, value, "global")) {
        model_mod.update(&app.model, .select_global);
    } else return error.UnsupportedScope;
    return writeSnapshot(&app.model, output);
}

fn handleAgent(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    const parsed = try parsePayload(app, invocation.request.payload);
    defer parsed.deinit();
    try setAgent(&app.model, try payloadString(try payloadObject(parsed.value), "value"));
    return writeSnapshot(&app.model, output);
}

fn handleSelect(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    const parsed = try parsePayload(app, invocation.request.payload);
    defer parsed.deinit();
    const id = try payloadString(try payloadObject(parsed.value), "id");
    for (&app.model.skill_rows) |*row| {
        if (row.id.len > 0 and std.mem.eql(u8, row.id, id)) {
            model_mod.update(&app.model, .{ .open_skill = row.id });
            return writeSnapshot(&app.model, output);
        }
    }
    return error.UnknownSkill;
}

fn handleRefresh(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    _ = invocation;
    const app = appFromContext(context);
    model_mod.update(&app.model, .refresh);
    return writeSnapshot(&app.model, output);
}

fn handleInstall(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    const parsed = try parsePayload(app, invocation.request.payload);
    defer parsed.deinit();
    const object = try payloadObject(parsed.value);
    const source = try payloadString(object, "source");
    const skill = try payloadString(object, "skill");
    const scope = try payloadString(object, "scope");
    const agent = try payloadString(object, "agent");

    app.model.install_source_buffer.set(source);
    app.model.install_skill_buffer.set(skill);
    try setAgent(&app.model, agent);
    if (std.mem.eql(u8, scope, "project")) {
        model_mod.update(&app.model, .install_project);
    } else if (std.mem.eql(u8, scope, "global")) {
        model_mod.update(&app.model, .install_global);
    } else return error.UnsupportedScope;
    return writeSnapshot(&app.model, output);
}

fn handleDiscover(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    const parsed = try parsePayload(app, invocation.request.payload);
    defer parsed.deinit();
    const source_text = try payloadString(try payloadObject(parsed.value), "source");
    const source = try github_source.parse(source_text, "");
    const io = app.model.io orelse return error.IoUnavailable;

    var candidates: [skill_store.max_skills]skill_store.GithubSkillCandidate = undefined;
    const count = try skill_store.discoverGithubSkills(app.model.allocator, io, source, &candidates);
    defer for (candidates[0..count]) |candidate| {
        app.model.allocator.free(candidate.path);
        app.model.allocator.free(candidate.name);
    };

    var writer = std.Io.Writer.fixed(output);
    try writer.writeAll("{\"candidates\":[");
    for (candidates[0..count], 0..) |candidate, index| {
        if (index != 0) try writer.writeAll(",");
        try writer.writeAll("{\"path\":");
        try writeString(&writer, candidate.path);
        try writePair(&writer, "name", candidate.name, false);
        try writer.writeAll("}");
    }
    try writer.writeAll("]}");
    return writer.buffered();
}

fn handleUpdate(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    try selectFromPayload(app, invocation.request.payload);
    model_mod.update(&app.model, .update_active);
    return writeSnapshot(&app.model, output);
}

fn handleRemove(context: *anyopaque, invocation: native_sdk.bridge.Invocation, output: []u8) anyerror![]const u8 {
    const app = appFromContext(context);
    try selectFromPayload(app, invocation.request.payload);
    model_mod.update(&app.model, .remove_active);
    return writeSnapshot(&app.model, output);
}

fn selectFromPayload(app: *SkillManagerApp, raw: []const u8) !void {
    const parsed = try parsePayload(app, raw);
    defer parsed.deinit();
    const id = try payloadString(try payloadObject(parsed.value), "id");
    for (&app.model.skill_rows) |*row| {
        if (row.id.len > 0 and std.mem.eql(u8, row.id, id)) {
            model_mod.update(&app.model, .{ .open_skill = row.id });
            return;
        }
    }
    return error.UnknownSkill;
}

fn setAgent(model: *Model, value: []const u8) !void {
    if (std.mem.eql(u8, value, "all")) {
        model_mod.update(model, .select_agent_all);
    } else if (std.mem.eql(u8, value, "codex")) {
        model_mod.update(model, .select_agent_codex);
    } else if (std.mem.eql(u8, value, "cursor")) {
        model_mod.update(model, .select_agent_cursor);
    } else if (std.mem.eql(u8, value, "claude-code")) {
        model_mod.update(model, .select_agent_claude);
    } else return error.UnsupportedAgent;
}

fn writeSnapshot(model: *const Model, output: []u8) ![]const u8 {
    var writer = std.Io.Writer.fixed(output);
    try writer.writeAll("{\"projects\":[");
    for (model.projects[0..model.project_total], 0..) |project, index| {
        if (index != 0) try writer.writeAll(",");
        try writer.writeAll("{\"path\":");
        try writeString(&writer, project.path);
        try writePair(&writer, "name", project.name, false);
        try writer.writeAll("}");
    }
    try writer.writeAll("],\"projectRoot\":");
    try writeString(&writer, model.project_root);
    try writer.writeAll(",\"skills\":[");
    var first = true;
    for (model.skill_rows) |row| {
        if (row.id.len == 0) continue;
        if (!first) try writer.writeAll(",");
        first = false;
        try writeSkill(&writer, &row);
    }
    try writer.writeAll("],\"counts\":{\"total\":");
    try writeNumber(&writer, model.total_count);
    try writer.writeAll(",\"project\":");
    try writeNumber(&writer, model.project_count);
    try writer.writeAll(",\"global\":");
    try writeNumber(&writer, model.global_count);
    try writer.writeAll(",\"visible\":");
    try writeNumber(&writer, model.visible_count);
    try writer.writeAll("},\"filters\":{\"search\":");
    try writeString(&writer, model.search());
    try writer.writeAll(",\"scope\":");
    try writeString(&writer, model.scope_filter);
    try writer.writeAll(",\"agent\":");
    try writeString(&writer, model.agent_filter);
    try writer.writeAll("},\"active\":");
    if (model.has_active_skill) {
        try writeString(&writer, model.active_skill_id);
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll(",\"detail\":");
    if (model.has_active_skill) {
        try writer.writeAll("{");
        try writePair(&writer, "name", model.active_name, true);
        try writePair(&writer, "description", model.active_description, false);
        try writePair(&writer, "scope", model.active_scope, false);
        try writePair(&writer, "scopeVariant", model.active_scope_variant, false);
        try writePair(&writer, "agent", model.active_agent, false);
        try writePair(&writer, "path", model.active_path, false);
        try writePair(&writer, "source", model.active_source, false);
        try writer.writeAll("}");
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll(",\"status\":");
    try writeString(&writer, model.status_line);
    try writer.writeAll(",\"operation\":{\"inProgress\":");
    try writeBool(&writer, model.operation_in_progress);
    try writer.writeAll(",\"label\":");
    try writeString(&writer, model.operation_label);
    try writer.writeAll("},\"error\":");
    if (model.has_error) {
        try writer.writeAll("{\"title\":");
        try writeString(&writer, model.error_title);
        try writer.writeAll(",\"detail\":");
        try writeString(&writer, model.error_detail);
        try writer.writeAll("}");
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll("}");
    return writer.buffered();
}

fn writeSkill(writer: *std.Io.Writer, row: *const model_mod.SkillRow) !void {
    try writer.writeAll("{\"id\":");
    try writeString(writer, row.id);
    try writePair(writer, "name", row.name, false);
    try writePair(writer, "description", row.description, false);
    try writePair(writer, "scope", row.scope, false);
    try writePair(writer, "scopeVariant", row.scope_variant, false);
    try writePair(writer, "agent", row.agent, false);
    try writePair(writer, "path", row.path_hint, false);
    try writePair(writer, "source", row.source, false);
    try writer.writeAll(",\"visible\":");
    try writeBool(writer, row.visible);
    try writer.writeAll(",\"active\":");
    try writeBool(writer, row.active);
    try writer.writeAll("}");
}

fn writePair(writer: *std.Io.Writer, key: []const u8, value: []const u8, first: bool) !void {
    if (!first) try writer.writeAll(",");
    try writer.writeAll("\"");
    try writer.writeAll(key);
    try writer.writeAll("\":");
    try writeString(writer, value);
}

fn writeString(writer: *std.Io.Writer, value: []const u8) !void {
    try writer.writeAll("\"");
    for (value) |char| {
        switch (char) {
            '"' => try writer.writeAll("\\\""),
            '\\' => try writer.writeAll("\\\\"),
            '\n' => try writer.writeAll("\\n"),
            '\r' => try writer.writeAll("\\r"),
            '\t' => try writer.writeAll("\\t"),
            0...8, 11...12, 14...31 => {
                var escaped: [6]u8 = undefined;
                _ = std.fmt.bufPrint(&escaped, "\\u{x:0>4}", .{char}) catch return error.JsonStringTooLong;
                try writer.writeAll(&escaped);
            },
            else => try writer.writeByte(char),
        }
    }
    try writer.writeAll("\"");
}

fn writeNumber(writer: *std.Io.Writer, value: usize) !void {
    var buffer: [32]u8 = undefined;
    try writer.writeAll(try std.fmt.bufPrint(&buffer, "{d}", .{value}));
}

fn writeBool(writer: *std.Io.Writer, value: bool) !void {
    try writer.writeAll(if (value) "true" else "false");
}

const app_permissions = [_][]const u8{ native_sdk.security.permission_command, native_sdk.security.permission_view };
const dev_origins = [_][]const u8{ "zero://app", "http://127.0.0.1:5173" };

pub fn main(init: std.process.Init) !void {
    const home = init.environ_map.get("HOME") orelse ".";
    var app = SkillManagerApp{
        .env_map = init.environ_map,
        .model = model_mod.initialModel(std.heap.page_allocator, init.io, home),
    };

    try runner.runWithOptions(app.app(), .{
        .app_name = "skillmanager",
        .window_title = "SkillManager",
        .bundle_id = "dev.skillmanager.desktop",
        .default_frame = native_sdk.geometry.RectF.init(0, 0, 1180, 760),
        .restore_state = false,
        .bridge = app.bridge(),
        .security = .{
            .permissions = &app_permissions,
            .navigation = .{ .allowed_origins = &dev_origins },
        },
    }, init);
}

test {
    _ = @import("tests.zig");
}
