using FightingGameStick.InputHost;

if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase))
{
    return await XInputSelfTest.RunAsync();
}

await using var runtime = new HostRuntime();
try
{
    while (!runtime.IsShuttingDown && await Console.In.ReadLineAsync() is { } line)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        try
        {
            await runtime.HandleAsync(line);
        }
        catch (Exception error)
        {
            await Console.Error.WriteLineAsync(error.Message);
        }
    }
}
catch (IOException)
{
    // Parent pipe closed. Disposal releases the controller and keyboard hook.
}

return 0;
