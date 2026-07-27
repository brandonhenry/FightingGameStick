using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading.Channels;

namespace FightingGameStick.InputHost;

internal sealed class LowLevelMouseHook : IDisposable
{
    private const int WhMouseLl = 14;
    private const int WmLeftDown = 0x0201;
    private const int WmLeftUp = 0x0202;
    private const int WmRightDown = 0x0204;
    private const int WmRightUp = 0x0205;
    private const int WmMiddleDown = 0x0207;
    private const int WmMiddleUp = 0x0208;
    private const int WmXButtonDown = 0x020B;
    private const int WmXButtonUp = 0x020C;
    private const int WmQuit = 0x0012;
    private const uint LlmhfInjected = 0x01;
    private const uint LlmhfLowerIlInjected = 0x02;

    private readonly ChannelWriter<HookInput> _writer;
    private readonly InputHookState _state;
    private readonly Thread _thread;
    private readonly HookProc _callback;
    private readonly ManualResetEventSlim _ready = new(false);
    private nint _hook;
    private uint _threadId;

    public LowLevelMouseHook(ChannelWriter<HookInput> writer, InputHookState state)
    {
        _writer = writer;
        _state = state;
        _callback = Callback;
        _thread = new Thread(MessageLoop) { IsBackground = true, Name = "FGS mouse hook" };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
        if (!_ready.Wait(TimeSpan.FromSeconds(5))) throw new TimeoutException("Mouse hook thread did not start.");
        if (_hook == 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not install mouse hook.");
    }

    public void Dispose()
    {
        if (_threadId != 0) PostThreadMessage(_threadId, WmQuit, 0, 0);
        _thread.Join(TimeSpan.FromSeconds(2));
        _ready.Dispose();
    }

    private nint Callback(int code, nint message, nint data)
    {
        if (code < 0 || !_state.MouseEnabled) return CallNextHookEx(_hook, code, message, data);
        var native = Marshal.PtrToStructure<MsLlHookStruct>(data);
        if ((native.Flags & (LlmhfInjected | LlmhfLowerIlInjected)) != 0)
            return CallNextHookEx(_hook, code, message, data);

        var messageId = unchecked((int)message);
        var down = messageId is WmLeftDown or WmRightDown or WmMiddleDown or WmXButtonDown;
        var up = messageId is WmLeftUp or WmRightUp or WmMiddleUp or WmXButtonUp;
        if (!down && !up) return CallNextHookEx(_hook, code, message, data);

        var key = MouseButton(messageId, native.MouseData);
        if (key is null) return CallNextHookEx(_hook, code, message, data);
        var capturedTarget = down ? _state.TryCapture() : null;
        _writer.TryWrite(new HookInput(key, down, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), false, capturedTarget));

        var suppress = capturedTarget is not null ||
            (_state.Enabled && !_state.Passthrough && _state.IsMapped(key));
        return suppress ? 1 : CallNextHookEx(_hook, code, message, data);
    }

    private static PhysicalKey? MouseButton(int message, uint mouseData)
    {
        if (message is WmLeftDown or WmLeftUp)
            return new PhysicalKey(0x1001, 0x01, true, "Mouse Left");
        if (message is WmRightDown or WmRightUp)
            return new PhysicalKey(0x1002, 0x02, true, "Mouse Right");
        if (message is WmMiddleDown or WmMiddleUp)
            return new PhysicalKey(0x1003, 0x04, true, "Mouse Middle");
        if (message != WmXButtonDown && message != WmXButtonUp) return null;
        return ((mouseData >> 16) & 0xffff) switch
        {
            1 => new PhysicalKey(0x1004, 0x05, true, "Mouse Back"),
            2 => new PhysicalKey(0x1005, 0x06, true, "Mouse Forward"),
            _ => null
        };
    }

    private void MessageLoop()
    {
        _threadId = GetCurrentThreadId();
        _hook = SetWindowsHookEx(WhMouseLl, _callback, GetModuleHandle(null), 0);
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

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct Point
    {
        public readonly int X;
        public readonly int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct MsLlHookStruct
    {
        public readonly Point Point;
        public readonly uint MouseData;
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
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern nint GetModuleHandle(string? moduleName);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
}
