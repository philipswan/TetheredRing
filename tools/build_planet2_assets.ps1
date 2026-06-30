<#
.SYNOPSIS
    Builds the planet2 cubed-sphere Earth assets (assets/earth) from scratch.

.DESCRIPTION
    This is the single source of truth for how the current assets/earth tile set
    is produced. It runs tools/generate_planet2_lod0_assets.py in three phases:

      1. Base bake      - global low/mid-res cubed-sphere tiles for all six faces.
      2. Island cone    - deep refinement over the Big Island using the high-res
                          XHR color + displacement source.
      3. Eastern fill   - a row of shallower cones east of the island so the LOD
                          drop-off to the base tiles is gradual and seamless.

    Phases 2 and 3 merge into the manifest produced by phase 1 (the generator is
    additive unless --reset-manifest is passed), so order matters: base first.

.PARAMETER DryRun
    Print every command that would run, but do not execute anything. Use this to
    review the pipeline against the assets you already have without regenerating.

.EXAMPLE
    pwsh tools/build_planet2_assets.ps1 -DryRun
    # Preview the full sequence without touching any files.

.EXAMPLE
    pwsh tools/build_planet2_assets.ps1
    # Rebuild assets/earth from scratch (overwrites the current tiles).
#>

[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Run from the repository root (the parent of this tools/ folder).
$RepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $RepoRoot
try {
    # --- Shared inputs -------------------------------------------------------
    $Generator   = 'tools/generate_planet2_lod0_assets.py'

    # High-res regional source covering the Hawaiian Islands (equirect crop).
    $RegionColor = 'textures/24x12/XHR/earth_XHR_24x12_1x4.jpg'
    $RegionHeight = 'textures/DisplacementMaps/XHREarthDisplacement/earth_XHR_24x12_1x4.png'
    # Geographic bounds of that crop: LON_MIN LON_MAX LAT_MIN LAT_MAX (degrees).
    $RegionBbox  = @('-165', '-150', '15', '30')

    # Base bake resolution (per-tile face / height grid sizes).
    $FaceSize    = 2048
    $HeightSize  = 256

    # Refinement geography. All cones share the same latitude band (the island).
    $RefineLat   = 19.7
    $IslandLon   = -155.5   # Big Island center; deepest cone.
    $IslandLod   = 11
    # Eastern ocean fill: shallower cones marching east to blend down to base LOD.
    $EastLons    = @(-155.0, -154.5, -154.0, -153.5, -153.0, -152.5, -152.0, -151.5, -151.0, -150.5)
    $EastLod     = 7

    # Helper: run (or, in -DryRun, just print) a python generator invocation.
    function Invoke-Generator {
        param([string[]]$GenArgs, [string]$Label)
        $display = "python $Generator " + ($GenArgs -join ' ')
        Write-Host ">> $Label" -ForegroundColor Cyan
        Write-Host "   $display"
        if (-not $DryRun) {
            & python $Generator @GenArgs
            if ($LASTEXITCODE -ne 0) {
                throw "Generator failed ($Label) with exit code $LASTEXITCODE"
            }
        }
    }

    # --- Phase 1: base bake (resets the manifest) ----------------------------
    Invoke-Generator -Label 'Phase 1/3: base bake (all faces)' -GenArgs @(
        '--face-size', $FaceSize,
        '--height-size', $HeightSize,
        '--reset-manifest'
    )

    # --- Phase 2: deep island cone ------------------------------------------
    Invoke-Generator -Label "Phase 2/3: island cone -> LOD $IslandLod" -GenArgs @(
        '--regional-color', $RegionColor,
        '--regional-height', $RegionHeight,
        '--regional-bbox', $RegionBbox[0], $RegionBbox[1], $RegionBbox[2], $RegionBbox[3],
        '--refine-lat', $RefineLat,
        '--refine-lon', $IslandLon,
        '--refine-max-lod', $IslandLod
    )

    # --- Phase 3: eastern ocean fill cones ----------------------------------
    $i = 0
    foreach ($lon in $EastLons) {
        $i++
        Invoke-Generator -Label "Phase 3/3: east fill $i/$($EastLons.Count) (lon=$lon) -> LOD $EastLod" -GenArgs @(
            '--regional-color', $RegionColor,
            '--regional-height', $RegionHeight,
            '--regional-bbox', $RegionBbox[0], $RegionBbox[1], $RegionBbox[2], $RegionBbox[3],
            '--refine-lat', $RefineLat,
            '--refine-lon', $lon,
            '--refine-max-lod', $EastLod
        )
    }

    if ($DryRun) {
        Write-Host "`nDry run complete - no files were modified." -ForegroundColor Yellow
    } else {
        Write-Host "`nDone. assets/earth rebuilt." -ForegroundColor Green
    }
}
finally {
    Pop-Location
}
