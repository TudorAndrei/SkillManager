const std = @import("std");
const builtin = @import("builtin");
const runner = @import("runner");
const native_sdk = @import("native_sdk");

pub const panic = std.debug.FullPanic(native_sdk.debug.capturePanic);

const canvas = native_sdk.canvas;
const geometry = native_sdk.geometry;
const model_mod = @import("model.zig");

pub const Model = model_mod.Model;
pub const Msg = model_mod.Msg;
pub const update = model_mod.update;

pub const canvas_label = "skillmanager-canvas";
pub const window_width: f32 = 1180;
pub const window_height: f32 = 760;
pub const window_min_width: f32 = 920;
pub const window_min_height: f32 = 620;

const app_permissions = [_][]const u8{ native_sdk.security.permission_command, native_sdk.security.permission_view };
const shell_views = [_]native_sdk.ShellView{
    .{ .label = canvas_label, .kind = .gpu_surface, .fill = true, .role = "SkillManager canvas", .accessibility_label = "SkillManager", .gpu_backend = .metal, .gpu_pixel_format = .bgra8_unorm, .gpu_present_mode = .timer, .gpu_alpha_mode = .@"opaque", .gpu_color_space = .srgb, .gpu_vsync = true },
};
const shell_windows = [_]native_sdk.ShellWindow{.{
    .label = "main",
    .title = "SkillManager",
    .width = window_width,
    .height = window_height,
    .min_width = window_min_width,
    .min_height = window_min_height,
    .restore_state = false,
    .titlebar = .hidden_inset_tall,
    .views = &shell_views,
}};
pub const shell_scene: native_sdk.ShellConfig = .{ .windows = &shell_windows };

pub const app_shortcuts = [_]native_sdk.Shortcut{
    .{ .id = "skillmanager.refresh", .key = "r", .modifiers = .{ .primary = true } },
    .{ .id = "skillmanager.install", .key = "n", .modifiers = .{ .primary = true } },
    .{ .id = "skillmanager.search", .key = "f", .modifiers = .{ .primary = true } },
};

pub fn onCommand(name: []const u8) ?Msg {
    if (std.mem.eql(u8, name, "skillmanager.refresh")) return .refresh;
    if (std.mem.eql(u8, name, "skillmanager.install")) return .install;
    return null;
}

pub fn onChrome(chrome: native_sdk.WindowChrome) ?Msg {
    return .{ .chrome_changed = chrome };
}

pub fn onAppearance(appearance: native_sdk.Appearance) ?Msg {
    return .{ .system_scheme = switch (appearance.color_scheme) {
        .light => .light,
        .dark => .dark,
    } };
}

pub fn skillManagerTokens(model: *const Model) canvas.DesignTokens {
    _ = model;
    var tokens = canvas.DesignTokens.theme(.{ .color_scheme = .dark });
    tokens.colors.background = canvas.Color.rgb8(14, 14, 14);
    tokens.colors.surface = canvas.Color.rgb8(22, 22, 22);
    tokens.colors.surface_subtle = canvas.Color.rgb8(25, 25, 25);
    tokens.colors.surface_pressed = canvas.Color.rgb8(32, 32, 32);
    tokens.colors.text = canvas.Color.rgb8(255, 255, 255);
    tokens.colors.text_muted = canvas.Color.rgb8(179, 179, 179);
    tokens.colors.border = canvas.Color.rgb8(42, 42, 42);
    tokens.colors.accent = canvas.Color.rgb8(133, 237, 117);
    tokens.colors.accent_text = canvas.Color.rgb8(0, 0, 0);
    tokens.colors.destructive = canvas.Color.rgb8(214, 75, 63);
    tokens.colors.success = canvas.Color.rgb8(45, 220, 154);
    tokens.colors.info = canvas.Color.rgb8(127, 182, 199);
    tokens.colors.focus_ring = canvas.Color.rgb8(45, 220, 154);
    tokens.radius = .{ .sm = 1, .md = 2, .lg = 3, .xl = 4 };
    return tokens;
}

const dev_markup_reload = builtin.mode == .Debug;
const SkillManagerApp = native_sdk.UiAppWithFeatures(Model, Msg, .{ .runtime_markup = dev_markup_reload });
pub const SkillManagerUi = canvas.Ui(Msg);
pub const skillmanager_markup = @embedFile("app.native");
pub const CompiledSkillManagerView = canvas.CompiledMarkupView(Model, Msg, skillmanager_markup);

pub fn main(init: std.process.Init) !void {
    const app_state = try std.heap.page_allocator.create(SkillManagerApp);
    defer std.heap.page_allocator.destroy(app_state);

    const home = init.environ_map.get("HOME") orelse ".";
    const initial_model = model_mod.initialModel(std.heap.page_allocator, init.io, home);

    app_state.* = SkillManagerApp.init(std.heap.page_allocator, initial_model, .{
        .name = "skillmanager",
        .scene = shell_scene,
        .canvas_label = canvas_label,
        .update = update,
        .tokens_fn = skillManagerTokens,
        .on_appearance = onAppearance,
        .on_chrome = onChrome,
        .on_command = onCommand,
        .view = CompiledSkillManagerView.build,
        .markup = if (dev_markup_reload)
            .{ .source = skillmanager_markup, .watch_path = "src/app.native", .io = init.io }
        else
            null,
    });
    defer app_state.deinit();

    try runner.runWithOptions(app_state.app(), .{
        .app_name = "skillmanager",
        .window_title = "SkillManager",
        .bundle_id = "dev.skillmanager.desktop",
        .default_frame = geometry.RectF.init(0, 0, window_width, window_height),
        .restore_state = false,
        .js_window_api = false,
        .shortcuts = &app_shortcuts,
        .security = .{
            .permissions = &app_permissions,
            .navigation = .{ .allowed_origins = &.{ "zero://inline", "zero://app" } },
        },
    }, init);
}

test {
    _ = @import("tests.zig");
}
