using System.Management;
using System.Security.Principal;
using System.Text.Json;
using LibreHardwareMonitor.Hardware;
using LibreHardwareMonitor.PawnIo;

// Local stdin/stdout protocol only. No listening socket, commands, paths, or settings from the renderer.
// EOF closes the computer and its driver handles. One process owns hardware across samples.
if (!OperatingSystem.IsWindows()) return;
var administrator = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
var computer = new Computer
{
    IsCpuEnabled = true, IsGpuEnabled = true, IsMemoryEnabled = true,
    IsMotherboardEnabled = true, IsControllerEnabled = true, IsStorageEnabled = true
};
var opened = false;
try
{
    string? request;
    while ((request = Console.ReadLine()) != null)
    {
        if (!int.TryParse(request, out var id)) continue;
        var sensors = new List<object>();
        var errors = new List<string>();
        string? sensorError = null;
        try
        {
            if (!opened) { computer.Open(); opened = true; }
            foreach (var hardware in computer.Hardware) ReadHardware(hardware, sensors, errors);
        }
        catch (UnauthorizedAccessException) { sensorError = "permission"; }
        catch (Exception) { sensorError = "driver"; }
        object? disk = null;
        string? diskError = null;
        try
        {
            using var searcher = new ManagementObjectSearcher("root\\cimv2",
                "SELECT DiskReadsPerSec,DiskWritesPerSec,DiskReadBytesPerSec,DiskWriteBytesPerSec FROM Win32_PerfFormattedData_PerfDisk_PhysicalDisk WHERE Name='_Total'");
            searcher.Options.Timeout = TimeSpan.FromSeconds(2);
            using var objects = searcher.Get();
            foreach (ManagementObject item in objects)
            {
                using (item) disk = new { read = Convert.ToDouble(item["DiskReadsPerSec"]), write = Convert.ToDouble(item["DiskWritesPerSec"]),
                    readBytes = Convert.ToDouble(item["DiskReadBytesPerSec"]), writeBytes = Convert.ToDouble(item["DiskWriteBytesPerSec"]) };
            }
        }
        catch (UnauthorizedAccessException) { diskError = "permission"; }
        catch (Exception) { diskError = "counters"; }
        Console.WriteLine(JsonSerializer.Serialize(new { protocol = 1, id, administrator, driverInstalled = PawnIo.IsInstalled, driverVersion = PawnIo.Version?.ToString(), sensors, sensorError, errors, disk, diskError }));
    }
}
finally { computer.Close(); }

static void ReadHardware(IHardware hardware, List<object> sensors, List<string> errors)
{
    try { hardware.Update(); }
    catch (Exception) { errors.Add(hardware.Name); return; }
    foreach (var sensor in hardware.Sensors)
    {
        var value = sensor.Value;
        sensors.Add(new { Identifier = sensor.Identifier.ToString(), Name = sensor.Name,
            Parent = hardware.Name, HardwareType = hardware.HardwareType.ToString(), SensorType = sensor.SensorType.ToString(),
            Value = value.HasValue && float.IsFinite(value.Value) ? value : null });
    }
    foreach (var child in hardware.SubHardware) ReadHardware(child, sensors, errors);
}
