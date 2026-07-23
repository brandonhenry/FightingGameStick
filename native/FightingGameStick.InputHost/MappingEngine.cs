namespace FightingGameStick.InputHost;

internal sealed class MappingEngine
{
    private MappingProfile _profile;
    private readonly HashSet<string> _pressed = [];
    private long _sequence;

    public MappingEngine(MappingProfile profile) => _profile = profile;

    public ControllerState Configure(MappingProfile profile)
    {
        _profile = profile;
        _pressed.Clear();
        return State();
    }

    public bool IsMapped(PhysicalKey key) => _profile.Bindings.Any(binding => binding.Source.Id == key.Id);

    public ControllerState? Transition(PhysicalKey key, bool down)
    {
        var changed = down ? _pressed.Add(key.Id) : _pressed.Remove(key.Id);
        return changed ? State() : null;
    }

    public ControllerState Reset()
    {
        _pressed.Clear();
        return State();
    }

    public ControllerState State()
    {
        var active = _profile.Bindings
            .Where(binding => _pressed.Contains(binding.Source.Id))
            .Select(binding => binding.Target)
            .ToHashSet(StringComparer.Ordinal);

        var buttons = Protocol.DigitalTargets.ToDictionary(target => target, active.Contains);
        if (buttons["dpad-left"] && buttons["dpad-right"])
            buttons["dpad-left"] = buttons["dpad-right"] = false;
        if (buttons["dpad-up"] && buttons["dpad-down"])
            buttons["dpad-up"] = buttons["dpad-down"] = false;
        return new ControllerState(
            buttons,
            ResolveStick(active, "left-stick"),
            ResolveStick(active, "right-stick"),
            active.Contains("lt") ? 1 : 0,
            active.Contains("rt") ? 1 : 0,
            ++_sequence,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    private static StickState ResolveStick(HashSet<string> active, string prefix)
    {
        var left = active.Contains($"{prefix}-left");
        var right = active.Contains($"{prefix}-right");
        var up = active.Contains($"{prefix}-up");
        var down = active.Contains($"{prefix}-down");
        double x = left == right ? 0 : left ? -1 : 1;
        double y = up == down ? 0 : up ? -1 : 1;
        if (x != 0 && y != 0)
        {
            x *= Math.Sqrt(0.5);
            y *= Math.Sqrt(0.5);
        }
        return new StickState(x, y);
    }
}
