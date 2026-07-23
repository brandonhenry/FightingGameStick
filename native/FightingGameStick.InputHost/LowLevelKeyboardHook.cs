using System.Collections.Immutable;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Channels;

namespace FightingGameStick.InputHost;

internal sealed class LowLevelKeyboardHook : IDisposable
{
    private const int WhKeyboardLl = 13;
    private const int WmKeyDown = 0x0100;
    private const int WmKeyUp = 0x0101;
    private const int WmSysKeyDown = 0x0104;
    private const int WmSysKeyUp = 0x0105;
    private const int WmQuit = 0x0012;
    private const uint LlkhfExtended = 0x01;
    private const uint LlkhfInjected = 0x10;
    private const int VkControl = 0x11;
    private const int VkMenu = 0x12;
    private const int VkF12 = 0x7B;

    private readonly ChannelWriter<HookInput> _writer;
    private readonly Thread _thread;
    private readonly HookProc _callback;
    private readonly ManualResetEventSlim _ready = new(false);
    private ImmutableHashSet<string> _mappedIds = ImmutableHashSet<string>.Empty;
    private nint _hook;
    private uint _threadId;
    private int _enabled;
    private int _passthrough;
    private string? _captureTarget;

    public LowLevelKeyboardHook(ChannelWriter<HookInput> writer)
    {
        _writer = writer;
        _callback = Callback;
        _thread = new Thread(MessageLoop) { IsBackground = true, Name = "FGS keyboard hook" };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
        if (!_ready.Wait(TimeSpan.FromSeconds(5))) throw new TimeoutException("Keyboard hook thread did not start.");
        if (_hook == 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not install keyboard hook.");
    }

    public void Configure(MappingProfile profile) =>
        Volatile.Write(ref _mappedIds, profile.Bindings.Select(binding => binding.Source.Id).ToImmutableHashSet());

    public void SetEnabled(bool value) => Volatile.Write(ref _enabled, value ? 1 : 0);
    public void SetPassthrough(bool value) => Volatile.Write(ref _passthrough, value ? 1 : 0);
    public void Capture(string target) => Interlocked.Exchange(ref _captureTarget, target);
    public void CancelCapture() => Interlocked.Exchange(ref _captureTarget, null);

    public void Dispose()
    {
        SetEnabled(false);
        CancelCapture();
        if (_threadId != 0) PostThreadMessage(_threadId, WmQuit, 0, 0);
        _thread.Join(TimeSpan.FromSeconds(2));
        _ready.Dispose();
    }

    private nint Callback(int code, nint message, nint data)
    {
        if (code < 0) return CallNextHookEx(_hook, code, message, data);
        var native = Marshal.PtrToStructure<KbdLlHookStruct>(data);
        if ((native.Flags & LlkhfInjected) != 0) return CallNextHookEx(_hook, code, message, data);

        var messageId = unchecked((int)message);
        var down = messageId is WmKeyDown or WmSysKeyDown;
        var up = messageId is WmKeyUp or WmSysKeyUp;
        if (!down && !up) return CallNextHookEx(_hook, code, message, data);

        var extended = (native.Flags & LlkhfExtended) != 0;
        var key = new PhysicalKey((int)native.ScanCode, (int)native.VirtualKey, extended, KeyLabel(native, extended));
        var emergency = down && native.VirtualKey == VkF12 && IsDown(VkControl) && IsDown(VkMenu);
        string? capturedTarget = null;
        if (down && !emergency) capturedTarget = Interlocked.Exchange(ref _captureTarget, null);
        _writer.TryWrite(new HookInput(key, down, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), emergency, capturedTarget));

        var mapped = Volatile.Read(ref _mappedIds).Contains(key.Id);
        var suppress = emergency || capturedTarget is not null ||
            (Volatile.Read(ref _enabled) == 1 && Volatile.Read(ref _passthrough) == 0 && mapped);
        return suppress ? 1 : CallNextHookEx(_hook, code, message, data);
    }

    private void MessageLoop()
    {
        _threadId = GetCurrentThreadId();
        _hook = SetWindowsHookEx(WhKeyboardLl, _callback, GetModuleHandle(null), 0);
        _ready.Set();
        if (_hook == 0) return;
        while (GetMessage(out var message, 0, 0, 0) > 0)
        {
            TranslateMessage(ref message);
            DispatchMessage(ref message);
        }
        UnhookWindowsHookEx(_hook);
        _hook = 0;
    }

    private static string KeyLabel(KbdLlHookStruct key, bool extended)
    {
        var buffer = new StringBuilder(64);
        var lParam = (int)(key.ScanCode << 16) | (extended ? 1 << 24 : 0);
        return GetKeyNameText(lParam, buffer, buffer.Capacity) > 0 ? buffer.ToString() : $"Key {key.VirtualKey}";
    }

    private static bool IsDown(int virtualKey) => (GetAsyncKeyState(virtualKey) & 0x8000) != 0;

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct KbdLlHookStruct
    {
        public readonly uint VirtualKey;
        public readonly uint ScanCode;
        public readonly uint Flags;
        public readonly uint Time;
        public readonly nuint ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Message
    {
        public nint Hwnd;
        public uint Value;
        public nuint WParam;
        public nint LParam;
        public uint Time;
        public int PointX;
        public int PointY;
        public uint Private;
    }

    private delegate nint HookProc(int code, nint message, nint data);

    [DllImport("user32.dll", SetLastError = true)] private static extern nint SetWindowsHookEx(int idHook, HookProc callback, nint module, uint threadId);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnhookWindowsHookEx(nint hook);
    [DllImport("user32.dll")] private static extern nint CallNextHookEx(nint hook, int code, nint message, nint data);
    [DllImport("user32.dll")] private static extern int GetMessage(out Message message, nint window, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll")] private static extern nint DispatchMessage(ref Message message);
    [DllImport("user32.dll")] private static extern bool PostThreadMessage(uint threadId, uint message, nuint wParam, nint lParam);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int virtualKey);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetKeyNameText(int lParam, StringBuilder text, int size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern nint GetModuleHandle(string? moduleName);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
}
