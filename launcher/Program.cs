using System.Diagnostics;
using System.Text;

Console.OutputEncoding = Encoding.UTF8;

var appDirectory = Path.GetFullPath(AppContext.BaseDirectory);
var scriptPath = Path.GetFullPath(Path.Combine(appDirectory, "Start-Eclipse-Media.ps1"));

if (!string.Equals(
        Path.GetDirectoryName(scriptPath)?.TrimEnd(Path.DirectorySeparatorChar),
        appDirectory.TrimEnd(Path.DirectorySeparatorChar),
        StringComparison.OrdinalIgnoreCase))
{
    return Fail("Launcher path validation failed.");
}

if (!File.Exists(scriptPath))
{
    return Fail("Start-Eclipse-Media.ps1 must be next to Eclipse Media.exe.");
}

var powerShell = FindPowerShell();
if (powerShell is null)
{
    return Fail("PowerShell was not found on this computer.");
}

try
{
    var startInfo = new ProcessStartInfo
    {
        FileName = powerShell,
        WorkingDirectory = appDirectory,
        UseShellExecute = false,
    };
    startInfo.ArgumentList.Add("-NoLogo");
    startInfo.ArgumentList.Add("-NoProfile");
    startInfo.ArgumentList.Add("-ExecutionPolicy");
    startInfo.ArgumentList.Add("Bypass");
    startInfo.ArgumentList.Add("-File");
    startInfo.ArgumentList.Add(scriptPath);

    using var process = Process.Start(startInfo);
    if (process is null)
    {
        return Fail("PowerShell launcher could not be started.");
    }

    process.WaitForExit();
    return process.ExitCode;
}
catch (Exception error) when (error is InvalidOperationException or System.ComponentModel.Win32Exception)
{
    return Fail($"Eclipse Media could not start: {error.Message}");
}

static string? FindPowerShell()
{
    var path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
    foreach (var directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
    {
        try
        {
            var candidate = Path.GetFullPath(Path.Combine(directory.Trim().Trim('"'), "pwsh.exe"));
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        catch (Exception error) when (error is ArgumentException or NotSupportedException or PathTooLongException)
        {
            // Ignore malformed PATH entries and continue to the trusted Windows fallback.
        }
    }

    var windowsDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
    var fallback = Path.Combine(windowsDirectory, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return File.Exists(fallback) ? fallback : null;
}

static int Fail(string message)
{
    Console.Error.WriteLine();
    Console.Error.WriteLine($"  ERROR: {message}");
    if (!Console.IsInputRedirected)
    {
        Console.Error.WriteLine("  Press Enter to close.");
        Console.ReadLine();
    }
    return 1;
}
