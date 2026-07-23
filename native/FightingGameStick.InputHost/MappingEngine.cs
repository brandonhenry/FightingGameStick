namespace FightingGameStick.InputHost;

internal sealed class MappingEngine
{
    private readonly object _sync = new();
    private MappingProfile _profile;
    private readonly HashSet<string> _pressed = [];
    private readonly Dictionary<string, IReadOnlyList<string>> _motionTargets = [];
    private long _sequence;

    public MappingEngine(MappingProfile profile) => _profile = profile;

    public ControllerState Configure(MappingProfile profile)
    {
        lock (_sync)
        {
            _profile = profile;
            _pressed.Clear();
            _motionTargets.Clear();
            return StateUnsafe();
        }
    }

    public bool IsMapped(PhysicalKey key)
    {
        lock (_sync) return _profile.Bindings.Any(binding => binding.Source.Id == key.Id);
    }

    public string? MotionShortcutFor(PhysicalKey key)
    {
        lock (_sync)
        {
            var target = _profile.Bindings.FirstOrDefault(binding => binding.Source.Id == key.Id)?.Target;
            return target is not null && MotionShortcuts.All.Contains(target) ? target : null;
        }
    }

    public ControllerState? Transition(PhysicalKey key, bool down)
    {
        lock (_sync)
        {
            var changed = down ? _pressed.Add(key.Id) : _pressed.Remove(key.Id);
            return changed ? StateUnsafe() : null;
        }
    }

    public ControllerState Reset()
    {
        lock (_sync)
        {
            _pressed.Clear();
            _motionTargets.Clear();
            return StateUnsafe();
        }
    }

    public ControllerState SetMotionTargets(string runId, IReadOnlyList<string>? targets)
    {
        lock (_sync)
        {
            if (targets is null) _motionTargets.Remove(runId);
            else _motionTargets[runId] = targets;
            return StateUnsafe();
        }
    }

    public ControllerState State()
    {
        lock (_sync) return StateUnsafe();
    }

    private ControllerState StateUnsafe()
    {
        var active = _profile.Bindings
            .Where(binding => _pressed.Contains(binding.Source.Id) && !MotionShortcuts.All.Contains(binding.Target))
            .Select(binding => binding.Target)
            .ToHashSet(StringComparer.Ordinal);
        foreach (var targets in _motionTargets.Values)
            active.UnionWith(targets);

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
