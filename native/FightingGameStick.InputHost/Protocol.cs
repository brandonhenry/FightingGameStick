using System.Text.Json.Serialization;

namespace FightingGameStick.InputHost;

internal static class Protocol
{
    public const int Version = 2;

    public static readonly string[] DigitalTargets =
    [
        "dpad-up", "dpad-down", "dpad-left", "dpad-right", "a", "b", "x", "y",
        "lb", "rb", "back", "start", "left-stick-click", "right-stick-click"
    ];
}

internal sealed record PhysicalKey(
    [property: JsonPropertyName("scanCode")] int ScanCode,
    [property: JsonPropertyName("virtualKey")] int VirtualKey,
    [property: JsonPropertyName("extended")] bool Extended,
    [property: JsonPropertyName("label")] string Label)
{
    [JsonIgnore] public string Id => $"{ScanCode}:{(Extended ? 1 : 0)}";
}

internal sealed record Binding(string Id, PhysicalKey Source, string Target);

internal sealed record MappingProfile(
    string Id,
    string Name,
    int SchemaVersion,
    IReadOnlyList<Binding> Bindings,
    string CreatedAt,
    string UpdatedAt);

internal sealed record InitializeCommand(int ProtocolVersion, MappingProfile Profile, bool Passthrough);
internal sealed record ConfigureCommand(MappingProfile Profile);
internal sealed record BooleanCommand(bool Value);
internal sealed record CaptureCommand(string Target);
internal sealed record PingCommand(long SentAt);

internal sealed record StickState(double X, double Y);

internal sealed record ControllerState(
    Dictionary<string, bool> Buttons,
    StickState LeftStick,
    StickState RightStick,
    double LeftTrigger,
    double RightTrigger,
    long Sequence,
    long Timestamp)
{
    public StickState LeftStick { get; set; } = LeftStick;
    public StickState RightStick { get; set; } = RightStick;
    public double LeftTrigger { get; set; } = LeftTrigger;
    public double RightTrigger { get; set; } = RightTrigger;
}

internal sealed record HookInput(PhysicalKey Key, bool Down, long Timestamp, bool Emergency, string? CapturedTarget);
