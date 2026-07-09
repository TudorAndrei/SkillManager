const std = @import("std");

pub const ParsedManifest = struct {
    name: ?[]const u8 = null,
    description: ?[]const u8 = null,
};

pub fn parse(text: []const u8) ParsedManifest {
    var result: ParsedManifest = .{};
    if (!std.mem.startsWith(u8, text, "---")) {
        result.description = firstParagraph(text);
        return result;
    }

    var lines = std.mem.splitScalar(u8, text, '\n');
    _ = lines.next();
    while (lines.next()) |raw_line| {
        const line = std.mem.trim(u8, raw_line, " \t\r");
        if (std.mem.eql(u8, line, "---")) break;
        if (std.mem.indexOfScalar(u8, line, ':')) |colon| {
            const key = std.mem.trim(u8, line[0..colon], " \t");
            const value = trimQuotes(std.mem.trim(u8, line[colon + 1 ..], " \t"));
            if (std.mem.eql(u8, key, "name")) result.name = value;
            if (std.mem.eql(u8, key, "description")) result.description = value;
        }
    }

    if (result.description == null) {
        result.description = firstParagraph(text);
    }
    return result;
}

fn trimQuotes(value: []const u8) []const u8 {
    if (value.len >= 2) {
        const first = value[0];
        const last = value[value.len - 1];
        if ((first == '"' and last == '"') or (first == '\'' and last == '\'')) {
            return value[1 .. value.len - 1];
        }
    }
    return value;
}

fn firstParagraph(text: []const u8) ?[]const u8 {
    var blocks = std.mem.splitSequence(u8, text, "\n\n");
    while (blocks.next()) |block| {
        const trimmed = std.mem.trim(u8, block, " \t\r\n");
        if (trimmed.len == 0) continue;
        if (std.mem.startsWith(u8, trimmed, "---")) continue;
        if (std.mem.startsWith(u8, trimmed, "#")) continue;
        if (std.mem.startsWith(u8, trimmed, "```")) continue;
        return trimmed;
    }
    return null;
}

test "parses frontmatter name and description" {
    const parsed = parse(
        "---\nname: find-docs\ndescription: Retrieve docs\n---\n\nBody\n",
    );
    try std.testing.expectEqualStrings("find-docs", parsed.name.?);
    try std.testing.expectEqualStrings("Retrieve docs", parsed.description.?);
}

test "falls back to first paragraph" {
    const parsed = parse("# Title\n\nUseful skill summary.\n\nMore.");
    try std.testing.expectEqualStrings("Useful skill summary.", parsed.description.?);
}
