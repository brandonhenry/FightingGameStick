using System.Runtime.InteropServices;

namespace FightingGameStick.InputHost;

internal static class XInputSelfTest
{
    public static async Task<int> RunAsync()
    {
        using var controller = new VirtualController();
        var pressed = Neutral();
        pressed.Buttons["a"] = true;
        pressed.LeftStick = new StickState(1, 0);
        pressed.RightTrigger = 1;
        controller.Apply(pressed);

        var slot = await FindStateAsync(state =>
            (state.Gamepad.Buttons & 0x1000) != 0 && state.Gamepad.LeftThumbX > 30_000 && state.Gamepad.RightTrigger == 255);
        if (slot < 0)
        {
            await Console.Error.WriteLineAsync("XInput did not observe the ViGEm button, axis, and trigger report.");
            return 1;
        }

        controller.Apply(Neutral());
        var released = await FindStateAsync(state =>
            state.Gamepad.Buttons == 0 && state.Gamepad.LeftThumbX == 0 && state.Gamepad.RightTrigger == 0, slot);
        if (released != slot)
        {
            await Console.Error.WriteLineAsync($"XInput player {slot + 1} did not return to neutral.");
            return 1;
        }

        await Console.Out.WriteLineAsync($"ViGEm/XInput self-test passed on player {slot + 1}.");
        return 0;
    }

    private static async Task<int> FindStateAsync(Func<XInputState, bool> predicate, int onlySlot = -1)
    {
        for (var attempt = 0; attempt < 30; attempt++)
        {
            for (uint slot = 0; slot < 4; slot++)
            {
                if (onlySlot >= 0 && slot != onlySlot) continue;
                if (XInputGetState(slot, out var state) == 0 && predicate(state)) return (int)slot;
            }
            await Task.Delay(50);
        }
        return -1;
    }

    private static ControllerState Neutral() => new(
        Protocol.DigitalTargets.ToDictionary(target => target, _ => false),
        new StickState(0, 0), new StickState(0, 0), 0, 0, 0,
        DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

    [StructLayout(LayoutKind.Sequential)]
    private struct XInputGamepad
    {
        public ushort Buttons;
        public byte LeftTrigger;
        public byte RightTrigger;
        public short LeftThumbX;
        public short LeftThumbY;
        public short RightThumbX;
        public short RightThumbY;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XInputState
    {
        public uint PacketNumber;
        public XInputGamepad Gamepad;
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    private static extern uint XInputGetState(uint playerIndex, out XInputState state);
}
