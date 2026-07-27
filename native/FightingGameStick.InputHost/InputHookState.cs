using System.Collections.Immutable;

namespace FightingGameStick.InputHost;

internal sealed class InputHookState
{
    private ImmutableHashSet<string> _mappedIds = ImmutableHashSet<string>.Empty;
    private int _enabled;
    private int _passthrough;
    private int _mouseEnabled;
    private string? _captureTarget;

    public void Configure(MappingProfile profile) =>
        Volatile.Write(ref _mappedIds, profile.Bindings.Select(binding => binding.Source.Id).ToImmutableHashSet());

    public void SetEnabled(bool value) => Volatile.Write(ref _enabled, value ? 1 : 0);
    public void SetPassthrough(bool value) => Volatile.Write(ref _passthrough, value ? 1 : 0);
    public void SetMouseEnabled(bool value) => Volatile.Write(ref _mouseEnabled, value ? 1 : 0);
    public void Capture(string target) => Interlocked.Exchange(ref _captureTarget, target);
    public void CancelCapture() => Interlocked.Exchange(ref _captureTarget, null);

    public bool Enabled => Volatile.Read(ref _enabled) == 1;
    public bool Passthrough => Volatile.Read(ref _passthrough) == 1;
    public bool MouseEnabled => Volatile.Read(ref _mouseEnabled) == 1;
    public bool IsMapped(PhysicalKey key) => Volatile.Read(ref _mappedIds).Contains(key.Id);
    public string? TryCapture() => Interlocked.Exchange(ref _captureTarget, null);
}
