Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinProbe {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
}
"@
$game = Get-Process StardewModdingAPI -ErrorAction SilentlyContinue
if (-not $game) { Write-Output 'NO-PROCESS'; exit 0 }
$ids = @($game.Id)
Write-Output ("PIDS=" + ($ids -join ','))
$rows = New-Object System.Collections.ArrayList
$cb = [WinProbe+EnumProc]{
  param($h, $l)
  $p = 0
  [void][WinProbe]::GetWindowThreadProcessId($h, [ref]$p)
  if ($ids -contains $p) {
    $t = New-Object System.Text.StringBuilder 256
    [void][WinProbe]::GetWindowText($h, $t, 256)
    $c = New-Object System.Text.StringBuilder 256
    [void][WinProbe]::GetClassName($h, $c, 256)
    [void]$rows.Add([pscustomobject]@{
      visible = [WinProbe]::IsWindowVisible($h)
      iconic  = [WinProbe]::IsIconic($h)
      title   = $t.ToString()
      class   = $c.ToString()
      hwnd    = $h.ToInt64()
    })
  }
  return $true
}
[void][WinProbe]::EnumWindows($cb, [IntPtr]::Zero)
if ($rows.Count -eq 0) { Write-Output 'NO-WINDOWS' } else { $rows | ConvertTo-Json -Compress }
