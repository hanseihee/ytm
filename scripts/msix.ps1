# Microsoft Store용 MSIX 만들기(Windows 전용): pwsh scripts/msix.ps1
# 미리 Store용으로 빌드해 둔다: VITE_DISTRIBUTION=store npx tauri build --no-bundle (GitHub Actions의 .github/workflows/msix.yml이 한다)
# 결과: release/msix/YTMusic_<버전>.0_x64.msix (서명하지 않는다. Store가 서명한다)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$id = Get-Content "$root/src-tauri/msix/identity.json" -Raw | ConvertFrom-Json
# MSIX_TEST_IDENTITY=1: Partner Center 값 없이 시험용 이름으로 묶는다(빌드 확인용, Store에 낼 수 없다)
$test = $env:MSIX_TEST_IDENTITY -eq '1'
if ($test) {
  $id.identityName = 'YTMusic.PipelineTest'
  $id.publisher = 'CN=PipelineTest'
  $id.publisherDisplayName = 'Pipeline Test'
}
foreach ($k in 'displayName', 'identityName', 'publisher', 'publisherDisplayName') {
  if (-not $id.$k) { throw "src-tauri/msix/identity.json의 $k 값이 비어 있습니다(Partner Center → 제품 ID의 값을 넣으세요)" }
}
# Store는 버전 마지막 자리가 0이어야 한다
$version = (Get-Content "$root/package.json" -Raw | ConvertFrom-Json).version + '.0'

$exe = @("$root/src-tauri/target/release/YTMusic.exe", "$root/src-tauri/target/release/ytm-desktop.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { throw '빌드된 exe가 없습니다. 먼저 npx tauri build --no-bundle' }

$out = "$root/release/msix"
$layout = "$out/layout"
Remove-Item $layout -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "$layout/Assets" -Force | Out-Null
Copy-Item $exe "$layout/YTMusic.exe"
foreach ($a in 'StoreLogo', 'Square44x44Logo', 'Square150x150Logo') {
  Copy-Item "$root/src-tauri/icons/$a.png" "$layout/Assets/$a.png"
}

# 설명 파일 채우기(정규식이 아닌 글자 그대로 바꾼다)
$esc = { param($s) [System.Security.SecurityElement]::Escape([string]$s) }
$manifest = (Get-Content "$root/src-tauri/msix/AppxManifest.xml" -Raw)
$values = @{
  '{{IDENTITY_NAME}}' = $id.identityName
  '{{PUBLISHER}}' = $id.publisher
  '{{PUBLISHER_DISPLAY_NAME}}' = $id.publisherDisplayName
  '{{DISPLAY_NAME}}' = $id.displayName
  '{{DESCRIPTION}}' = $id.description
  '{{VERSION}}' = $version
  '{{EXECUTABLE}}' = 'YTMusic.exe'
}
foreach ($k in $values.Keys) { $manifest = $manifest.Replace($k, (& $esc $values[$k])) }
if ($manifest -match '\{\{') { throw "설명 파일에 채우지 않은 자리가 남았습니다" }
Set-Content "$layout/AppxManifest.xml" $manifest -Encoding utf8

# Windows SDK 도구(가장 새 버전)
$makeappx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.*\x64\makeappx.exe" |
  Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $makeappx) { throw 'Windows SDK의 makeappx.exe를 찾지 못했습니다' }
$bin = $makeappx.DirectoryName

# resources.pri(언어·크기별 자원 색인). 만들지 못해도 패키지는 쓸 수 있어서 경고만 남긴다.
& "$bin\makepri.exe" createconfig /cf "$out/priconfig.xml" /dq lang-ko-KR /pv 10.0.0 /o
if ($LASTEXITCODE -eq 0) {
  & "$bin\makepri.exe" new /pr $layout /cf "$out/priconfig.xml" /mn "$layout/AppxManifest.xml" /of "$layout/resources.pri" /o
}
if ($LASTEXITCODE -ne 0) { Write-Warning 'resources.pri를 만들지 못했습니다(없이 묶습니다)'; Remove-Item "$layout/resources.pri" -ErrorAction SilentlyContinue }

$msix = if ($test) { "$out/YTMusic_${version}_x64-test.msix" } else { "$out/YTMusic_${version}_x64.msix" }
& "$bin\makeappx.exe" pack /d $layout /p $msix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx pack 실패($LASTEXITCODE)" }
Write-Host "만들었습니다: $msix"
