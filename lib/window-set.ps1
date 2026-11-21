param(
  [Parameter(Mandatory = $true)][ValidateSet('game', 'smapi')] $Target,
  [Parameter(Mandatory = $true)][ValidateSet('normal', 'minimized', 'hidden', 'maximized')] $Mode
)

# 设置星露谷两个窗口的显示状态。
#   game  = 游戏窗口（class SDL_app，属于 StardewModdingAPI 进程）
#   smapi = SMAPI 控制台。**注意它不一定属于 SMAPI 进程**：
#           Win11 默认把控制台跑在 Windows Terminal 里，窗口类 CASCADIA_HOSTING_WINDOW_CLASS，
#           属于 WindowsTerminal.exe；老一点的是 ConsoleWindowClass（conhost）；
#           还有个 PseudoConsoleWindow，那是 SMAPI 进程自己的伪控制台宿主。
#           三种都认，靠标题含「SMAPI」认出来。

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinSet {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
}
"@

$smapiProc = Get-Process StardewModdingAPI -ErrorAction SilentlyContinue
if (-not $smapiProc) { Write-Output 'NO-PROCESS'; exit 0 }
$ids = @($smapiProc.Id)

$matched = New-Object System.Collections.ArrayList
$cb = [WinSet+EnumProc]{
  param($h, $l)
  $p = 0
  [void][WinSet]::GetWindowThreadProcessId($h, [ref]$p)
  $c = New-Object System.Text.StringBuilder 256
  [void][WinSet]::GetClassName($h, $c, 256)
  $cls = $c.ToString()
  $t = New-Object System.Text.StringBuilder 256
  [void][WinSet]::GetWindowText($h, $t, 256)
  $title = $t.ToString()
  $hit = $false
  if ($Target -eq 'game') {
    if ($cls -eq 'SDL_app' -and $ids -contains $p) { $hit = $true }
  } else {
    # 三种控制台窗口，用标题里的 SMAPI 认
    if ($title -match 'SMAPI') {
      if ($cls -eq 'ConsoleWindowClass' -or $cls -eq 'CASCADIA_HOSTING_WINDOW_CLASS' -or $cls -eq 'PseudoConsoleWindow') { $hit = $true }
    }
    # SMAPI 进程自己的伪控制台宿主通常是空标题，也一并算上
    if ($cls -eq 'PseudoConsoleWindow' -and $ids -contains $p) { $hit = $true }
  }
  if ($hit) {
    [void]$matched.Add([pscustomobject]@{ hwnd = $h; title = $title; cls = $cls; pid = $p })
  }
  return $true
}
[void][WinSet]::EnumWindows($cb, [IntPtr]::Zero)

if ($matched.Count -eq 0) { Write-Output 'NO-WINDOW'; exit 0 }

$cmd = switch ($Mode) {
  'hidden' { 0 }
  'minimized' { 6 }
  'maximized' { 3 }
  default { 9 }
}

foreach ($w in $matched) {
  if ($Mode -eq 'normal') {
    [void][WinSet]::ShowWindow($w.hwnd, 9)
    [void][WinSet]::ShowWindow($w.hwnd, 5)
  } else {
    [void][WinSet]::ShowWindow($w.hwnd, $cmd)
  }
}

$after = ($matched | ForEach-Object {
  $v = [WinSet]::IsWindowVisible($_.hwnd)
  '{0}:{1}' -f $_.cls, ($(if ($v) { 'visible' } else { 'hidden' }))
}) -join ','
Write-Output ("SET={0} MODE={1} COUNT={2} {3}" -f $Target, $Mode, $matched.Count, $after)
