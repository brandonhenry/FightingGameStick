using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;

namespace FightingGameStick.InputHost;

internal sealed class HostRuntime : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly Channel<HookInput> _input = Channel.CreateUnbounded<HookInput>(new UnboundedChannelOptions
    {
        SingleReader = true,
        SingleWriter = false
    });
    private readonly SemaphoreSlim _outputLock = new(1, 1);
    private readonly SemaphoreSlim _controllerLock = new(1, 1);
    private readonly CancellationTokenSource _shutdown = new();
    private readonly object _motionSync = new();
    private readonly Dictionary<string, CancellationTokenSource> _motionRuns = [];
    private readonly InputHookState _hookState = new();
    private LowLevelKeyboardHook? _keyboardHook;
    private LowLevelMouseHook? _mouseHook;
    private VirtualController? _controller;
    private MappingEngine? _engine;
    private Task? _inputWorker;
    private bool _enabled;
    private long _lastAppliedSequence;

    public async Task HandleAsync(string line)
    {
        using var document = JsonDocument.Parse(line);
        var root = document.RootElement;
        var type = root.GetProperty("type").GetString();
        switch (type)
        {
            case "initialize":
                await InitializeAsync(root.Deserialize<InitializeCommand>(JsonOptions)
                    ?? throw new InvalidDataException("Invalid initialize command."));
                break;
            case "configure":
                Configure(root.Deserialize<ConfigureCommand>(JsonOptions)!.Profile);
                break;
            case "enable":
                SetEnabled(root.Deserialize<BooleanCommand>(JsonOptions)!.Value);
                break;
            case "passthrough":
                _hookState.SetPassthrough(root.Deserialize<BooleanCommand>(JsonOptions)!.Value);
                break;
            case "mouse":
                _hookState.SetMouseEnabled(root.Deserialize<BooleanCommand>(JsonOptions)!.Value);
                break;
            case "capture":
                _hookState.Capture(root.Deserialize<CaptureCommand>(JsonOptions)!.Target);
                break;
            case "cancel-capture":
                _hookState.CancelCapture();
                break;
            case "reset":
                Reset();
                break;
            case "ping":
                var ping = root.Deserialize<PingCommand>(JsonOptions)!;
                await EmitAsync(new { type = "pong", sentAt = ping.SentAt, receivedAt = Now() });
                break;
            case "shutdown":
                _shutdown.Cancel();
                break;
            default:
                await EmitAsync(new { type = "log", level = "warn", message = $"Ignored unknown command: {type}" });
                break;
        }
    }

    public bool IsShuttingDown => _shutdown.IsCancellationRequested;

    public async ValueTask DisposeAsync()
    {
        _shutdown.Cancel();
        CancelMotionRuns();
        _hookState.SetEnabled(false);
        _hookState.CancelCapture();
        try { Reset(); } catch { /* The driver may have disconnected. */ }
        _mouseHook?.Dispose();
        _keyboardHook?.Dispose();
        _input.Writer.TryComplete();
        if (_inputWorker is not null)
        {
            try { await _inputWorker.ConfigureAwait(false); } catch { /* Shutdown remains best effort. */ }
        }
        _controller?.Dispose();
        _controllerLock.Dispose();
        _outputLock.Dispose();
        _shutdown.Dispose();
    }

    private async Task InitializeAsync(InitializeCommand command)
    {
        if (command.ProtocolVersion != Protocol.Version)
        {
            await EmitFaultAsync("PROTOCOL_MISMATCH", $"Host protocol {Protocol.Version} cannot use app protocol {command.ProtocolVersion}.", false);
            return;
        }

        try
        {
            ValidateProfile(command.Profile);
            _engine = new MappingEngine(command.Profile);
            _controller = new VirtualController();
            _hookState.Configure(command.Profile);
            _hookState.SetPassthrough(command.Passthrough);
            _hookState.SetMouseEnabled(command.MouseEnabled);
            _keyboardHook = new LowLevelKeyboardHook(_input.Writer, _hookState);
            _mouseHook = new LowLevelMouseHook(_input.Writer, _hookState);
            _inputWorker = Task.Run(ProcessInputAsync);
            var playerIndex = await WaitForPlayerIndexAsync();
            await EmitAsync(new
            {
                type = "ready",
                protocolVersion = Protocol.Version,
                driverVersion = _controller.DriverVersion ?? "detected",
                playerIndex
            });
            await PublishStateAsync(_engine.State());
        }
        catch (Exception error)
        {
            var driverFault = error.GetType().Name.Contains("Vigem", StringComparison.OrdinalIgnoreCase) ||
                              error.Message.Contains("ViGEm", StringComparison.OrdinalIgnoreCase);
            await EmitFaultAsync(driverFault ? "DRIVER_MISSING" : "HOST_INITIALIZE_FAILED", error.Message, true);
        }
    }

    private void Configure(MappingProfile profile)
    {
        ValidateProfile(profile);
        SetEnabled(false, "Profile changed");
        _hookState.Configure(profile);
        if (_engine is not null) PublishState(_engine.Configure(profile));
    }

    private void SetEnabled(bool value, string? reason = null)
    {
        _enabled = value;
        _hookState.SetEnabled(value);
        if (!value)
        {
            CancelMotionRuns();
            Reset();
        }
        Emit(new { type = "enabled", value, reason });
    }

    private void Reset()
    {
        CancelMotionRuns();
        if (_engine is not null) PublishState(_engine.Reset());
    }

    private async Task ProcessInputAsync()
    {
        await foreach (var input in _input.Reader.ReadAllAsync())
        {
            if (input.Emergency)
            {
                SetEnabled(false, "Emergency shortcut");
                continue;
            }
            if (input.CapturedTarget is not null)
            {
                await EmitAsync(new { type = "capture", key = input.Key, target = input.CapturedTarget });
                continue;
            }
            await EmitAsync(new { type = "key", key = input.Key, down = input.Down, timestamp = input.Timestamp });
            if (_enabled && _engine is not null)
            {
                var shortcut = input.Down ? _engine.MotionShortcutFor(input.Key) : null;
                var state = _engine.Transition(input.Key, input.Down);
                if (state is not null && shortcut is not null)
                {
                    _ = PlayMotionAsync(input.Key.Id, shortcut);
                }
                else if (state is not null)
                {
                    try
                    {
                        await PublishStateAsync(state);
                    }
                    catch (Exception error)
                    {
                        _enabled = false;
                        _hookState.SetEnabled(false);
                        _engine.Reset();
                        await EmitFaultAsync("DRIVER_DISCONNECTED", error.Message, true);
                    }
                }
            }
        }
    }

    private void PublishState(ControllerState state) => PublishStateAsync(state).GetAwaiter().GetResult();

    private async Task PublishStateAsync(ControllerState state)
    {
        await _controllerLock.WaitAsync();
        try
        {
            if (state.Sequence <= _lastAppliedSequence) return;
            _lastAppliedSequence = state.Sequence;
            _controller?.Apply(state);
            await EmitAsync(new { type = "controller", state });
        }
        finally
        {
            _controllerLock.Release();
        }
    }

    private async Task PlayMotionAsync(string runId, string shortcut)
    {
        var cancellation = new CancellationTokenSource();
        lock (_motionSync)
        {
            if (_motionRuns.Remove(runId, out var previous))
            {
                previous.Cancel();
            }
            _motionRuns[runId] = cancellation;
        }

        try
        {
            var frames = MotionShortcuts.Frames(shortcut);
            for (var index = 0; index < frames.Count; index++)
            {
                cancellation.Token.ThrowIfCancellationRequested();
                if (!_enabled || _engine is null) return;
                await PublishStateAsync(_engine.SetMotionTargets(runId, frames[index]));
                var duration = index == frames.Count - 1 ? MotionShortcuts.AttackMilliseconds : MotionShortcuts.StepMilliseconds;
                await Task.Delay(duration, cancellation.Token);
            }
            if (_enabled && _engine is not null)
                await PublishStateAsync(_engine.SetMotionTargets(runId, null));
        }
        catch (OperationCanceledException)
        {
            // Reset/configure owns the neutral report when a shortcut is interrupted.
        }
        catch (Exception error)
        {
            _enabled = false;
            _hookState.SetEnabled(false);
            CancelMotionRuns();
            if (_engine is not null) await PublishStateAsync(_engine.Reset());
            await EmitFaultAsync("DRIVER_DISCONNECTED", error.Message, true);
        }
        finally
        {
            lock (_motionSync)
            {
                if (_motionRuns.TryGetValue(runId, out var current) && ReferenceEquals(current, cancellation))
                    _motionRuns.Remove(runId);
            }
            cancellation.Dispose();
        }
    }

    private void CancelMotionRuns()
    {
        CancellationTokenSource[] runs;
        lock (_motionSync)
        {
            runs = [.. _motionRuns.Values];
            _motionRuns.Clear();
        }
        foreach (var run in runs) run.Cancel();
    }

    private static void ValidateProfile(MappingProfile profile)
    {
        if (profile.SchemaVersion != 1) throw new InvalidDataException("Unsupported profile schema version.");
        if (profile.Bindings.Count > 256) throw new InvalidDataException("Profile has too many bindings.");
        var duplicateSource = profile.Bindings.GroupBy(binding => binding.Source.Id).FirstOrDefault(group => group.Count() > 1);
        if (duplicateSource is not null) throw new InvalidDataException($"Duplicate source key {duplicateSource.Key}.");
        if (profile.Bindings.Any(binding =>
                !ControllerTargets.All.Contains(binding.Target) &&
                !ControllerChords.IsValid(binding.Target) &&
                !MotionShortcuts.IsValid(binding.Target)))
            throw new InvalidDataException("Profile contains an unknown controller target.");
    }

    private Task EmitFaultAsync(string code, string message, bool recoverable) =>
        EmitAsync(new { type = "fault", code, message, recoverable });

    private void Emit(object value) => EmitAsync(value).GetAwaiter().GetResult();

    private async Task EmitAsync(object value)
    {
        var json = JsonSerializer.Serialize(value, JsonOptions);
        await _outputLock.WaitAsync();
        try
        {
            await Console.Out.WriteLineAsync(json);
            await Console.Out.FlushAsync();
        }
        catch (IOException)
        {
            _shutdown.Cancel();
        }
        finally
        {
            _outputLock.Release();
        }
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private async Task<int?> WaitForPlayerIndexAsync()
    {
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var index = _controller?.PlayerIndex;
            if (index is not null) return index;
            await Task.Delay(50);
        }
        return null;
    }
}

internal static class ControllerChords
{
    private const string Prefix = "chord-";
    private static readonly string[] Buttons = ["a", "b", "x", "y", "lb", "rb", "lt", "rt"];

    public static bool IsValid(string target)
    {
        if (!target.StartsWith(Prefix, StringComparison.Ordinal)) return false;
        var buttons = target[Prefix.Length..].Split('+', StringSplitOptions.None);
        if (buttons.Length is < 2 or > 8 || buttons.Distinct(StringComparer.Ordinal).Count() != buttons.Length)
            return false;
        var indexes = buttons.Select(button => Array.IndexOf(Buttons, button)).ToArray();
        return indexes.All(index => index >= 0) &&
               indexes.Zip(indexes.Skip(1), (left, right) => left < right).All(valid => valid);
    }

    public static IReadOnlyList<string> Targets(string target)
    {
        if (!IsValid(target)) throw new InvalidDataException("Unknown controller chord.");
        return target[Prefix.Length..].Split('+');
    }
}

internal static class MotionShortcuts
{
    public const int StepMilliseconds = 35;
    public const int AttackMilliseconds = 50;
    private static readonly string[] Attacks = ["a", "b", "x", "y", "lb", "rb", "lt", "rt"];

    public static bool IsValid(string target)
    {
        if (target is "qcf" or "qcb") return true;
        var parts = target.Split('-', StringSplitOptions.None);
        if (parts.Length != 2 || (parts[0] != "qcf" && parts[0] != "qcb")) return false;
        var attacks = parts[1].Split('+', StringSplitOptions.None);
        if (attacks.Length is < 1 or > 8 || attacks.Distinct(StringComparer.Ordinal).Count() != attacks.Length) return false;
        var indexes = attacks.Select(attack => Array.IndexOf(Attacks, attack)).ToArray();
        return indexes.All(index => index >= 0) && indexes.Zip(indexes.Skip(1), (left, right) => left < right).All(valid => valid);
    }

    public static IReadOnlyList<IReadOnlyList<string>> Frames(string target)
    {
        if (!IsValid(target)) throw new InvalidDataException("Unknown motion shortcut.");
        var separator = target.IndexOf('-');
        var motion = separator < 0 ? target : target[..separator];
        string[] attacks = separator < 0 ? [] : target[(separator + 1)..].Split('+');
        var horizontal = motion == "qcf" ? "dpad-right" : "dpad-left";
        return
        [
            ["dpad-down"],
            ["dpad-down", horizontal],
            [horizontal, .. attacks]
        ];
    }
}

internal static class ControllerTargets
{
    public static readonly HashSet<string> All =
    [
        .. Protocol.DigitalTargets,
        "left-stick-up", "left-stick-down", "left-stick-left", "left-stick-right",
        "right-stick-up", "right-stick-down", "right-stick-left", "right-stick-right",
        "lt", "rt"
    ];
}
