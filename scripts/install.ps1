$ErrorActionPreference = "Stop"

$Repo = "specterworksco/capsule"
$InstallDir = if ($env:CAPSULE_INSTALL_DIR) { $env:CAPSULE_INSTALL_DIR } else { Join-Path $env:USERPROFILE ".capsule\bin" }

$arch = switch ($env:PROCESSOR_ARCHITECTURE) {
  "AMD64" { "x64" }
  "ARM64" { "arm64" }
  default { throw "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE" }
}

if ($arch -ne "x64") {
  throw "Windows $arch releases are not published yet"
}

$asset = "capsule-windows-$arch.exe"
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
Write-Host "Capsule added to your PATH for this session and future shells."
