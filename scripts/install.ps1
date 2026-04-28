$ErrorActionPreference = "Stop"

$Repo = "specterworksco/capsule"
$InstallDir = if ($env:CAPSULE_INSTALL_DIR) { $env:CAPSULE_INSTALL_DIR } else { Join-Path $env:USERPROFILE ".capsule\bin" }
$TargetOverride = $env:CAPSULE_INSTALL_TARGET
$Variant = if ($env:CAPSULE_INSTALL_VARIANT) { $env:CAPSULE_INSTALL_VARIANT.ToLowerInvariant() } else { "default" }

$arch = switch ($env:PROCESSOR_ARCHITECTURE) {
  "AMD64" { "x64" }
  "ARM64" { "arm64" }
  default { throw "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE" }
}

function Resolve-AssetFromTarget([string] $Target) {
  switch ($Target) {
    "bun-windows-x64" { return "capsule-windows-x64.exe" }
    "bun-windows-x64-baseline" { return "capsule-windows-x64-baseline.exe" }
    "bun-windows-x64-modern" { return "capsule-windows-x64-modern.exe" }
    "bun-windows-arm64" { return "capsule-windows-arm64.exe" }
    default { throw "Unsupported CAPSULE_INSTALL_TARGET: $Target" }
  }
}

function Resolve-Asset([string] $Arch, [string] $RequestedVariant, [string] $RequestedTarget) {
  if ($RequestedTarget) {
    return Resolve-AssetFromTarget $RequestedTarget
  }

  switch ("$Arch:$RequestedVariant") {
    "x64:default" { return "capsule-windows-x64.exe" }
    "x64:baseline" { return "capsule-windows-x64-baseline.exe" }
    "x64:modern" { return "capsule-windows-x64-modern.exe" }
    "arm64:default" { return "capsule-windows-arm64.exe" }
    default { throw "Unsupported install variant '$RequestedVariant' for windows-$Arch" }
  }
}

$asset = Resolve-Asset -Arch $arch -RequestedVariant $Variant -RequestedTarget $TargetOverride
$url = "https://github.com/$Repo/releases/latest/download/$asset"
$destination = Join-Path $InstallDir "capsule.exe"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $destination

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @()
if ($userPath) {
  $pathEntries = $userPath -split ";" | Where-Object { $_ }
}

if ($pathEntries -notcontains $InstallDir) {
  $newPath = @($InstallDir) + $pathEntries -join ";"
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  $env:Path = $newPath
}

Write-Host "Capsule installed to $destination"
Write-Host "Installed release asset: $asset"
Write-Host "Capsule added to your PATH for this session and future shells."
