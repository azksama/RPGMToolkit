$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
foreach ($name in @('JAVA_HOME','ANDROID_HOME','NDK_HOME','RPGM_SIGN_STORE','RPGM_SIGN_PASSWORD')) {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Définissez $name dans l’environnement du processus avant la compilation." }
}
$env:TAURI_ANDROID_PROJECT_PATH = Join-Path $appRoot 'src-tauri/gen/android'
$env:WRY_ANDROID_PACKAGE = 'fr.azk.rpgmtoolkit'
$env:WRY_ANDROID_LIBRARY = 'rpgm_installer_lib'
$env:WRY_ANDROID_KOTLIN_FILES_OUT_DIR = Join-Path $appRoot 'src-tauri/gen/android/app/src/main/java/fr/azk/rpgmtoolkit/generated'
$env:TAURI_ANDROID_PACKAGE_UNESCAPED = 'fr.azk.rpgmtoolkit'
$env:RUSTFLAGS = '-C link-arg=-Wl,-z,max-page-size=16384'
$toolchain = Join-Path $env:NDK_HOME 'toolchains/llvm/prebuilt/windows-x86_64/bin'
$targets = @(
    @{ triple='aarch64-linux-android'; clang='aarch64-linux-android26-clang.cmd'; abi='arm64-v8a' },
    @{ triple='armv7-linux-androideabi'; clang='armv7a-linux-androideabi26-clang.cmd'; abi='armeabi-v7a' },
    @{ triple='x86_64-linux-android'; clang='x86_64-linux-android26-clang.cmd'; abi='x86_64' }
)
Push-Location $appRoot
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    $metadataText = cargo metadata --manifest-path src-tauri/Cargo.toml --locked --format-version 1 --filter-platform aarch64-linux-android
    if ($LASTEXITCODE -ne 0) { throw 'Métadonnées Cargo indisponibles.' }
    $metadata = $metadataText | ConvertFrom-Json
    $tauriPackage = $metadata.packages | Where-Object { $_.name -eq 'tauri' } | Select-Object -First 1
    if (-not $tauriPackage) { throw 'Sources Tauri introuvables.' }
    $tauriAndroid = (Join-Path (Split-Path $tauriPackage.manifest_path -Parent) 'mobile/android').Replace('\','/')
    $settings = "include ':tauri-android'`nproject(':tauri-android').projectDir = new File(`"$tauriAndroid`")`n"
    [IO.File]::WriteAllText((Join-Path $env:TAURI_ANDROID_PROJECT_PATH 'tauri.settings.gradle'), $settings)
    [IO.File]::WriteAllText((Join-Path $env:TAURI_ANDROID_PROJECT_PATH 'local.properties'), ('sdk.dir=' + $env:ANDROID_HOME.Replace('\','/') + "`n"))
    foreach ($target in $targets) {
        [Environment]::SetEnvironmentVariable(('CARGO_TARGET_' + $target.triple.ToUpper().Replace('-','_') + '_LINKER'), (Join-Path $toolchain $target.clang), 'Process')
        [Environment]::SetEnvironmentVariable(('CC_' + $target.triple.Replace('-','_')), (Join-Path $toolchain $target.clang), 'Process')
        [Environment]::SetEnvironmentVariable(('AR_' + $target.triple.Replace('-','_')), (Join-Path $toolchain 'llvm-ar.exe'), 'Process')
        cargo build --manifest-path src-tauri/Cargo.toml --release --lib --features custom-protocol --target $target.triple --locked
        if ($LASTEXITCODE -ne 0) { throw "Échec de compilation Rust : $($target.triple)" }
        $destination = Join-Path $appRoot ('src-tauri/gen/android/app/src/main/jniLibs/' + $target.abi)
        New-Item -ItemType Directory -Force -Path $destination | Out-Null
        Copy-Item -LiteralPath (Join-Path $metadata.target_directory ($target.triple + '/release/librpgm_installer_lib.so')) -Destination (Join-Path $destination 'librpgm_installer_lib.so') -Force
    }
    Push-Location src-tauri/gen/android
    try {
        ./gradlew.bat --no-daemon assembleUniversalRelease -x rustBuildUniversalRelease '-PabiList=arm64-v8a,armeabi-v7a,x86_64' '-ParchList=arm64,arm,x86_64' '-PtargetList=aarch64,armv7,x86_64'
        if ($LASTEXITCODE -ne 0) { throw 'Gradle assembly failed.' }
    } finally { Pop-Location }
} finally { Pop-Location }
