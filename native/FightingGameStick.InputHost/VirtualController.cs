using System.Diagnostics;
using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets;
using Nefarius.ViGEm.Client.Targets.Xbox360;

namespace FightingGameStick.InputHost;

internal sealed class VirtualController : IDisposable
{
    private readonly ViGEmClient _client;
    private readonly IXbox360Controller _controller;

    public VirtualController()
    {
        _client = new ViGEmClient();
        _controller = _client.CreateXbox360Controller();
        _controller.AutoSubmitReport = false;
        _controller.Connect();
        Apply(Neutral());
    }

    public int? PlayerIndex
    {
        get
        {
            try { return _controller.UserIndex; }
            catch { return null; }
        }
    }

    public string? DriverVersion
    {
        get
        {
            var driverPath = Path.Combine(Environment.SystemDirectory, "drivers", "ViGEmBus.sys");
            if (!File.Exists(driverPath)) return null;
            return FileVersionInfo.GetVersionInfo(driverPath).FileVersion;
        }
    }

    public void Apply(ControllerState state)
    {
        _controller.SetButtonState(Xbox360Button.Up, state.Buttons["dpad-up"]);
        _controller.SetButtonState(Xbox360Button.Down, state.Buttons["dpad-down"]);
        _controller.SetButtonState(Xbox360Button.Left, state.Buttons["dpad-left"]);
        _controller.SetButtonState(Xbox360Button.Right, state.Buttons["dpad-right"]);
        _controller.SetButtonState(Xbox360Button.A, state.Buttons["a"]);
        _controller.SetButtonState(Xbox360Button.B, state.Buttons["b"]);
        _controller.SetButtonState(Xbox360Button.X, state.Buttons["x"]);
        _controller.SetButtonState(Xbox360Button.Y, state.Buttons["y"]);
        _controller.SetButtonState(Xbox360Button.LeftShoulder, state.Buttons["lb"]);
        _controller.SetButtonState(Xbox360Button.RightShoulder, state.Buttons["rb"]);
        _controller.SetButtonState(Xbox360Button.Back, state.Buttons["back"]);
        _controller.SetButtonState(Xbox360Button.Start, state.Buttons["start"]);
        _controller.SetButtonState(Xbox360Button.LeftThumb, state.Buttons["left-stick-click"]);
        _controller.SetButtonState(Xbox360Button.RightThumb, state.Buttons["right-stick-click"]);
        _controller.SetAxisValue(Xbox360Axis.LeftThumbX, ToAxis(state.LeftStick.X));
        _controller.SetAxisValue(Xbox360Axis.LeftThumbY, ToAxis(-state.LeftStick.Y));
        _controller.SetAxisValue(Xbox360Axis.RightThumbX, ToAxis(state.RightStick.X));
        _controller.SetAxisValue(Xbox360Axis.RightThumbY, ToAxis(-state.RightStick.Y));
        _controller.SetSliderValue(Xbox360Slider.LeftTrigger, ToTrigger(state.LeftTrigger));
        _controller.SetSliderValue(Xbox360Slider.RightTrigger, ToTrigger(state.RightTrigger));
        _controller.SubmitReport();
    }

    public void Dispose()
    {
        try { Apply(Neutral()); } catch { /* The bus may already be gone. */ }
        try { _controller.Disconnect(); } catch { /* Best-effort safe release. */ }
        _client.Dispose();
    }

    private static short ToAxis(double value) =>
        value <= -1 ? short.MinValue : (short)Math.Round(Math.Clamp(value, -1, 1) * short.MaxValue);

    private static byte ToTrigger(double value) => (byte)Math.Round(Math.Clamp(value, 0, 1) * byte.MaxValue);

    private static ControllerState Neutral() => new(
        Protocol.DigitalTargets.ToDictionary(target => target, _ => false),
        new StickState(0, 0), new StickState(0, 0), 0, 0, 0,
        DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
}
