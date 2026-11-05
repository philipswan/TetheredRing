# Large assets: planet tiles and textures

## Where they live

- **Planet tiles** (`assets/<name>/`) are in Git LFS. The repository's `.lfsconfig` points LFS at the
  project's Cloudflare R2 bucket, with read-only credentials: anyone can pull, and only someone with
  write credentials can upload new objects. `assets/**` is tracked by LFS, including `assets/README.md`
  (the tile format), so even an edit to that file needs an upload.
- **Textures** (`textures/`, gitignored) are downloaded from project-atlantis.com by
  `npm run sync-textures` (also run by `npm run setup`).

`npm run setup` sets `lfs.skipdownloaderrors` in the clone's own config, so an LFS object that is
committed but not in the bucket yet stays a pointer file instead of failing the checkout.

## Regional high-resolution tiles, and the fallback

The global tile sets (`assets/earth`, `assets/moon`) cover the whole body; regional bakes
(`assets/hawaii`, `assets/chimborazo`, ...) add much sharper imagery and terrain over a small area, as
overlays on top. Each preset lists the regional bakes for where it looks (`planetSetup` in
`src/presets/planetSetup.js`), whether they exist yet or not.

At run time each listed bake is used if it is on the machine. If it is not, or it is still an LFS
pointer file, it is skipped: the scene uses the global tiles there, and its imagery credit is not shown.
So a bake made locally shows up in its scenes straight away (preview it as if it were in LFS), and the
same commit still works on a machine that only has the global tiles.

The bakes the presets list, with their approximate sizes (`--estimate`, below):

| Bake | Area | Scenes | Status |
|---|---|---|---|
| `hawaii` | Big Island | bigIslandLauncher, toMarsHawaii, elevatedEvacuatedTubeDeployment, variableSpeedScrew, grapplerEngineering, launchLookingBackwards, toLowOrbitFromEarth | in LFS |
| `chimborazo` | Chimborazo, Ecuador | (toMarsHawaii's alternative site) | in LFS |
| `new_zealand` | North Island; central plateau sharpest | launchVehicleOrbit, launchVehicleDollyShot, launchVehiclePanShot, launchVehicleFountain, launchSystemOverview, twoStageMassDriver, flightPaths | proposed, ~440 MB |
| `washington` | Washington State; Cascades sharpest | transitVehicleDollyShotWashington, smallRing, movingRingsOrbit | proposed, ~250 MB |
| `kilimanjaro` | Mount Kilimanjaro | demonstratorLauncher | proposed, ~100 MB |
| `boca_chica` | Boca Chica, Texas | toLEOFromBocaChikaWithStarship | proposed, ~65 MB |
| `christmas_island` | Christmas Island | christmasIslandLauncher | proposed, ~55 MB |
| `queensland` | North Queensland | transitVehicleDollyShotAustralia | proposed, ~110 MB |

The proposed areas come from the regions the old planet renderer loaded in high resolution for those
scenes, and from where their cameras look. Check them (the cores especially) before baking.

## Baking a regional Earth bake

The Earth regions are defined in `EARTH_REGIONS` in `tools/adaptive_lod.py`: the area to fetch imagery
(EOxCloudless 2024) and terrain (Copernicus GLO-30) for, and bands of tiles to bake, each a box with its
deepest level of detail. To add a region, add an entry there and its name and centre to
`REGIONAL_ASSETS` in `src/presets/planetSetup.js`, then list it in the scenes' `planetSetup` calls.

Needs Python 3 with numpy and Pillow, and `toktx` from KTX-Software
(https://github.com/KhronosGroup/KTX-Software/releases). `toktx` is required: without it the tool writes
PNG tiles, which the renderer does not load (it streams KTX2 only).

PowerShell:

```powershell
python -m tools.adaptive_lod new_zealand --estimate   # tile counts and size, no downloads
python -m tools.adaptive_lod new_zealand --jobs 8     # fetch the sources (cached in .cache/) and bake into assets/new_zealand
npm run dev                                           # then open http://localhost:5173/?preset=launchSystemOverview
```

POSIX shells:

```sh
python3 -m tools.adaptive_lod new_zealand --estimate
python3 -m tools.adaptive_lod new_zealand --jobs 8
npm run dev
```

## Planet source data (`tools/sources`)

The tile bakes are to read their imagery and terrain from one authoritative, georeferenced
Cloud-Optimized GeoTIFF (COG) per source, built from the raw downloads by the builders in `tools/sources/`.
The raw data is staged in `additional_earth_imagery/` (gitignored) and the COGs are written to
`additional_earth_imagery/sources/`. Each builder's docstring says exactly what it reads, which defects it
repairs and how they were found.

| COG | Builder | From | Grid |
|---|---|---|---|
| `blue_marble_15s.tif` | `build_blue_marble` | NASA Blue Marble Next Generation, April 2004 (`EarthImages/Earth/bluemarble_86400x43200.png`, identical to NASA's `world.topo.200404.3x21600x21600` tiles) | 86400 x 43200 RGB, EPSG:4326, 15" |
| `land_elevation_gmted_7.5s.tif` | `build_land_elevation` | GMTED2010 7.5" (`TILE_*.psb`), with GEBCO 2026 where GMTED has no data | 172800 x 86400 float32 m, EPSG:4326, 7.5"; 0 over the sea |
| `elevation_7.5s.tif`, `ocean_mask_7.5s.tif` | `build_elevation` | the land elevation, with GEBCO 2026's sea floor over the ocean | the same grid; the mask is uint8, 255 = ocean |
| `nz_imagery_10m.tif`, `nz_elevation_8m.tif` | `build_new_zealand` | LINZ New Zealand 10m Satellite Imagery (2022-2023) and NZ 8m DEM (2012) | EPSG:2193 (NZTM2000) |
| `hawaii_xhr_{1x4,2x4,3x4}.tif` | `build_hawaii` | Esri World Imagery, fetched by `tools/download_xhr_hawaii_texture_tiles.py` | EPSG:4326, 15-degree cells |

The Copernicus GLO-30 tiles for Hawaii's terrain (`DisplacementMaps/XHREarthDisplacement/`) are already COGs
and are used as they are. All the global grids are pixel-is-area from (-180, 90); GEBCO's
pixel-centre-registered 15" grid is the same lattice.

### What was repaired

- **Blue Marble**: corrupt rows at the North Pole and poor data above 88N (blended to each row's mean),
  a single bad row at 89N, pasting seams at 80N and 60S (levelled), and the 180-degree wrap, which does not
  meet north of about 63N (blended).
- **Land elevation**:
  - The GMTED tiles hold data only from 84N to 56S. North of 84N they hold -1; south of 56S, constant
    fill values in 30-degree strips. Both are treated as no data.
  - GMTED has no Greenland (it is 0 m there). The 30" `GREENLAND.psb` and `ANTARTIC.psb` patches that
    came with the tiles are no longer used: GEBCO 2026 is sharper and more accurate in both places (see
    the builder). The Greenland patch also covered a whole rectangle, 72-90N from 150W to 0 and 50-72N from
    60W to 0, replacing GMTED's 7.5" data with 30" data over the Canadian Arctic, Iceland, Ireland and western
    Britain, with seams along 72N, 60W and 50N, and it had no data north of about 81N (Peary Land).
  - Land that GMTED lacks is filled from GEBCO: holes in the ice caps of Svalbard and Franz Josef Land and
    in parts of the Canadian Arctic Archipelago, islands GMTED misses, and the eastern tip of Taveuni
    (Fiji), which tile A cuts off at 180 degrees.
  - Void-fill artefacts, where GMTED is far below sea level but GEBCO has land: a pit in the Sahara
    (29.47N 8.00E, down to -665 m) and areas of the Patagonian fjords and ice fields (down to -458 m),
    Tierra del Fuego and South Georgia. Real depressions (the Dead Sea, Qattara, open-pit mines) are kept.
  - The 180-degree meridian, where the tiles do not quite meet (blended).
- **Elevation and ocean mask**: which cells are ocean is decided by GEBCO's Type Identifier, its depth and
  connection to the open ocean (see the builder), so the Dead Sea, the Caspian, Death Valley, Qattara and
  the Dutch polders keep their land heights. GMTED is 0 (no data) over a band through the middle of the
  Caspian, whose surface is -27 m elsewhere; that band takes the lake's surface height. GEBCO's own grid
  does not quite meet across 180 degrees; over the ocean the two sides are blended.
- **New Zealand**: LINZ's export came in two parts. The clipped tiles in the plain zip fill the cells the
  unpacked tiles leave empty.
- **Hawaii imagery**: its georeferencing is reconstructed from how the downloader built it, which put
  Hawaii 0.6-0.8 pixel (about 70 m) south of where it is under the previous pixel-is-point assumption.

### Alignment between sources

Measured by phase correlation refined to sub-pixel accuracy (`.scratch` scripts, not committed), on the
coarser source's grid:

| Sources compared | On the grid of | Where | Offset (pixels of that grid; + = east, + = south) | |
|---|---|---|---|---|
| NZ 8m DEM vs land elevation (GMTED) | 7.5" | Cook Strait, Northland, Southland | -0.07 to -0.09 E, -0.01 to +0.06 S (about 15 m); heights differ by -2 to -5 m on average | aligned |
| Copernicus GLO-30 vs land elevation | 7.5" | Big Island | -0.12 E, +0.05 S (about 26 m); heights -1.3 m on average | aligned |
| NZ imagery vs NZ DEM coastline | 20 m | Wellington, Banks Peninsula | 15-30 m (150 m in Tauranga's tidal harbour) | aligned |
| Hawaii XHR vs Copernicus coastline | XHR (about 100 m) | three Big Island coasts | was +0.5 to +1.2 S and +0.1 to +1.1 E; now -0.2 to +0.4 S and -0.2 to +0.75 E | fixed in `build_hawaii` |
| Hawaii XHR vs Blue Marble | 15" | Big Island, Maui to Oahu, inland | +0.50 to +0.58 E, +0.10 to +0.24 S (about 220 m) | within a pixel |
| NZ imagery vs Blue Marble | 15" | three coastal and three inland windows | +1.1 to +1.5 E (450-500 m) | Blue Marble is off |
| Blue Marble COG vs NASA's original tiles | 15" | New Zealand, Hawaii, Mauritania | under 0.07 | identical |

Blue Marble's registration varies from place to place by up to about 1.5 pixels: about 500 m west in New
Zealand and 220 m west in Hawaii. Against GMTED's coastline, other regions range from 0 to about 2 pixels,
though coastlines are a poor reference for it (beaches, surf and reefs). NASA's original April 2004 tiles
are the same, so this is in NASA's data, not a convention error in the builder, and it is not corrected.
Where a regional bake has sharper imagery, use that imagery for every level of detail there rather than
switching from Blue Marble at some level, or the coastline will jump between levels.

### Known remaining defects

- GMTED's own source seams along a few whole-degree meridians in the high Arctic (64E in Novaya Zemlya, 48E
  in Franz Josef Land, 40E, 96E, 142-147E, 80W and 104W): steps of 2-20 m over 2-3 pixels. An automatic
  leveller was tried and did more harm than good in rugged terrain elsewhere.
- GEBCO's own artefacts: faint bands, under 1 m, about four cells wide at its 90-degree tile edges in
  Antarctica; a ridge-like line along 55.000W from 10N to 20N (+44/-48 m) and a 24 m step along 154.77E from
  10S to 20S, both in deep ocean.
- Some Arctic waters are enclosed by GEBCO cells that GEBCO codes as land a metre or so above sea level, so
  they are not ocean in the mask: the Yenisei Gulf, and bodies in Foxe Basin, Queen Maud Gulf and the East
  Siberian Sea of 1000-2000 km2 each.

### Running the builders

They need a Python 3 environment with numpy, Pillow, scipy, rasterio (with GDAL's JPEG 2000 driver, which
the rasterio wheels include) and pyproj. Each builder streams its raster in row blocks, but the land
elevation and elevation builders hold one 15" global mask (3.7 GB) and its labels (up to 15 GB) in memory
at once: allow about 25 GB of RAM, and run them one at a time. `build_elevation` needs the land elevation,
so build that first. Both extract GEBCO's zips into `GEBCO_2026/extracted/` (11 GB) the first time
(`--gebco-tiles DIR` points them at a folder of already extracted tiles instead). On 16 cores the land elevation
takes about 7 minutes and the elevation about 12; the elevation COG is 19 GB.

GEBCO 2026 (the "ice surface elevation" GeoTIFF version and the Type Identifier grid) comes from CEDA:
https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/ (catalogue:
https://catalogue.ceda.ac.uk/uuid/fb236c93aa574cb9b5154db45dfdd784). Put `gebco_2026_geotiff.zip` and
`gebco_2026_tid_geotiff.zip` in `additional_earth_imagery/GEBCO_2026/`.

PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install numpy pillow scipy rasterio pyproj
.venv\Scripts\python -m tools.sources.build_blue_marble
.venv\Scripts\python -m tools.sources.build_new_zealand            # or: build_new_zealand imagery / elevation
.venv\Scripts\python -m tools.sources.build_hawaii
.venv\Scripts\python -m tools.sources.build_land_elevation
.venv\Scripts\python -m tools.sources.build_elevation
```

POSIX shells:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install numpy pillow scipy rasterio pyproj
.venv/bin/python -m tools.sources.build_blue_marble
.venv/bin/python -m tools.sources.build_new_zealand
.venv/bin/python -m tools.sources.build_hawaii
.venv/bin/python -m tools.sources.build_land_elevation
.venv/bin/python -m tools.sources.build_elevation
```

### The high-resolution global Earth tiles (`assets/earth_hires`)

`tools/earth_hires.py` bakes a global Earth tile set from the COGs above, beside `assets/earth` (which it
leaves alone), in the same format and height range, so the regional bakes still stack on top of it:

- Colour is Blue Marble alone, at every level, so the globe seen from space is one unbroken dataset.
  Heights are the GMTED/GEBCO elevation; the ocean mask gives each tile its `landFraction`.
- The grids are sampled as pixel-is-area and wrap across 180 degrees (the bake of `assets/earth` was
  half a source pixel out at either end and clamped at the meridian). Each level samples the COG
  overview that matches its sample spacing, so coarse tiles are not aliased; every tile of a level uses
  the same one, so neighbouring height tiles share their edge samples exactly, as the renderer needs.
- Tiles: everything through LOD 3, land to LOD 6, rough terrain and its surroundings to LOD 7 (Blue
  Marble's full resolution), and the regional bakes' areas to LOD 6: about 35,000 tiles, 3.3 GB.
- Its manifest's `overlayMinLod` (7) keeps the regional bakes' coarser tiles out, so they appear only
  close up (below a few hundred km) and the globe is all Blue Marble from further out.

It needs the COGs `blue_marble_15s.tif`, `elevation_7.5s.tif` and `ocean_mask_7.5s.tif` in
`additional_earth_imagery/sources/` (`--sources DIR` for another folder) and `toktx`. The overview levels it
samples are exported once to `.cache/earth_hires/` (about 20 GB). On 16 cores it takes about 20 minutes.

PowerShell:

```powershell
.venv\Scripts\python -m tools.earth_hires --estimate   # the tile plan and its size
.venv\Scripts\python -m tools.earth_hires --jobs 16    # bake assets/earth_hires
```

POSIX shells:

```sh
.venv/bin/python -m tools.earth_hires --estimate
.venv/bin/python -m tools.earth_hires --jobs 16
```

`--land-lod`, `--mountain-lod`, `--regional-lod`, `--percentile` and `--dilate` change the plan, and
`--resume` finishes an interrupted bake. The app uses these tiles by default (`EARTH_BASE_TILES` in
`src/planet/Planet.js`); where they are not on the machine (not baked, or not pulled from Git LFS) it uses
`assets/earth` instead. `?earthTiles=earth` picks the original set for a page load. To compare the two from
the same view, use **Scene → Earth imagery (A/B, T)** or press `T`: it switches in place, without
reloading, and the set switched away from keeps its tiles, so switching back is immediate. They are
not in Git LFS until they are committed and uploaded (see below).

Not done yet:

- The ocean mask only gives `landFraction`. The renderer still draws the sea (and its fog) wherever the
  terrain is below 0 m, so the Caspian, the Dead Sea and other land below sea level are flooded to sea
  level, as they are with `assets/earth`. Using the mask needs a renderer change (and a way to carry it
  in the tiles).
- The regional bakes' outer tiles were baked against `assets/earth`'s Blue Marble sampling; where they meet
  `assets/earth_hires` the imagery can differ by up to half a Blue Marble pixel (about 230 m).

### Seasonal sea ice (`assets/sea_ice`)

`tools/sources/build_sea_ice.py` builds a monthly sea ice climatology for each pole from the NSIDC Sea Ice
Index (Version 4, G02135): the monthly concentration grids (25 km, polar stereographic) for 2016-2025,
downloaded once into `additional_earth_imagery/sea_ice/` (no login needed), averaged for each calendar
month, with land, coast and the Arctic pole hole filled from the nearest sea, and resampled onto a polar
azimuthal grid per pole (512 px, out to 36 degrees from the equator): `north.bin` and `south.bin` (3 MB
each) and `manifest.json`.

At run time `src/planet/seaIce.js` blends the two months either side of the simulated date and the sea
surface draws the ice over the water (opaque, matte), broken into floes by noise near its edge. It is also
drawn on the ground below sea level and over the first 40 m above it, fading out, so it covers the ragged
edge of the sea surface and runs a little way onto the shore. **Rendering → showSeaIce** turns it
off. Without the data (not built, or not pulled from Git LFS) there is no ice.

PowerShell:

```powershell
.venv\Scripts\python -m tools.sources.build_sea_ice
```

POSIX shells:

```sh
.venv/bin/python -m tools.sources.build_sea_ice
```

Not done: ice on lakes, land snow (Blue Marble shows April's), and the ice as seen from under the water.

### Surface wind climatology (`src/physics/windClimatology.data.js`)

`tools/sources/build_wind.py` builds a monthly climatology of the 10 m wind from the NCEP/NCAR Reanalysis 1
6-hourly winds (T62 Gaussian grid, ~1.9 degrees) for 2022-2023, downloaded once from NOAA PSL into
`additional_earth_imagery/wind/ncep/` (about 200 MB, no login needed). For each calendar month and 5-degree
grid node it keeps the mean wind, its daily cycle (first harmonic in UTC hours) and the RMS of the weather
about them, as a 300 KB generated module committed to the repository (not an LFS asset: it is small, and
the vessels need it as soon as they are placed). `src/physics/wind.js` interpolates it and adds
procedural weather (see there). Needs `netCDF4` in `.venv`.

PowerShell:

```powershell
uv pip install --python .venv\Scripts\python.exe netCDF4
.venv\Scripts\python -m tools.sources.build_wind
```

POSIX shells:

```sh
uv pip install --python .venv/bin/python netCDF4
.venv/bin/python -m tools.sources.build_wind
```

### Weather climatology (`src/physics/weatherClimatology.data.js`)

`tools/sources/build_weather.py` builds the climatology the clouds, rain and haze are drawn from, from the same
NCEP/NCAR Reanalysis 1 6-hourly fields (2022-2023, downloaded once from NOAA PSL into
`additional_earth_imagery/weather/ncep/`, about 650 MB): total cloud cover, the low and high cloud layers'
base and top pressures, precipitation and its convective part, and the humidity, temperature and pressure
near the surface. For each calendar month and 5-degree grid node it keeps the cloud cover (mean, spread and
daily cycle), the low cloud's base and top and the high cloud's frequency and base (heights by the standard
atmosphere), how often and how hard it rains and the convective share, and the relative humidity (mean and
spread), as a 550 KB generated module. `src/physics/weather.js` turns it into the weather at a place and date
with the wind's lows and highs (`src/physics/weatherNoise.js`).

PowerShell:

```powershell
.venv\Scripts\python -m tools.sources.build_weather
```

POSIX shells:

```sh
.venv/bin/python -m tools.sources.build_weather
```

### Real clouds (`assets/clouds`)

`tools/sources/build_clouds.py` builds the clouds seen from space: for the 15th of each month of 2024, the
cloud opacity over the whole planet (10240 x 5120, about 3.9 km a pixel, greyscale JPEG, about 15 MB each)
from NASA GIBS's daily VIIRS (Suomi NPP) true-colour composites, downloaded once into
`additional_earth_imagery/clouds/` (about 1.5 GB, no login needed). The clouds are separated from the ground
by comparing the day with the clear ground (the darkest of each pixel over the days around it, so it has the
season's snow); sun glint is removed with NOAA-20's and Terra's imagery of the same day, whose glint is
elsewhere; clouds fade out over snow and ice; and the western hemisphere is taken from the day before, which
moves the composite's day boundary from the date line to a cross-fade in the mid-Atlantic. At run time
`src/planet/clouds/realClouds.js` shows the snapshot nearest the simulated date, blending in from 60 km up
(see Weather and clouds in docs/ARCHITECTURE.md). Without the data there are none, and the clouds come from
the weather everywhere.

PowerShell:

```powershell
.venv\Scripts\python -m tools.sources.build_clouds
```

POSIX shells:

```sh
.venv/bin/python -m tools.sources.build_clouds
```

### Generated close-up ground (`assets/hawaii_ground`)

Below the deepest baked tile, the Big Island's ground is generated in the browser (`src/planet/groundData.js`,
`src/planet/groundDetail.js`; see Generated ground in docs/ARCHITECTURE.md) from a small bake of what the ground is
made of. `tools/ground_cover.py` makes it, in 0.1-degree chunks of about 27 m cells (240 chunks, the sea round the
island included, about 30 MB):

- the terrain's heights from Copernicus GLO-30 at its full resolution (the baked tiles have them every 150 m), and
  the sea floor from the planet source data's elevation (GEBCO bathymetry; `additional_earth_imagery/sources`);
- vegetation, tree and shrub cover from ESA WorldCover 2021 (10 m), with dry grass, which WorldCover calls bare,
  found in Sentinel-2 cloudless 2024 imagery (tan, not the grey of lava);
- how rough the lava is (a'a or pahoehoe), sand and cinder, from the imagery and the heights;
- the distance to the coastline (WorldCover's water joined to the open sea, at 10 m), how high the coast rises
  behind it (cliffs are a rise of more than 10 m within 30 m of the sea) and the sand's shade. The island's beaches
  are listed in the tool (`BEACHES`, with their sand: white, grey, black, green or pebbles), each moved to the best
  nearby shoreline when baked; white coral sand is also found in the imagery.

The sources are downloaded into `.cache/ground/` (about 230 MB; not in Git). The Sentinel-2 imagery is used only
to classify the ground, never drawn. `--preview <folder> --only i_j,...` writes PNGs of chunks' channels.

PowerShell:

```powershell
.venv\Scripts\python.exe -m tools.ground_cover hawaii
.venv\Scripts\python.exe -m tools.ground_cover hawaii --only 3_4 --preview .scratch\ground
```

POSIX shells:

```sh
.venv/bin/python -m tools.ground_cover hawaii
.venv/bin/python -m tools.ground_cover hawaii --only 3_4 --preview .scratch/ground
```

### Credits and licences

| Source | Credit | Licence |
|---|---|---|
| Blue Marble | NASA Earth Observatory, Blue Marble Next Generation (Reto Stöckli) | Public domain (NASA); credit requested |
| GMTED2010 | U.S. Geological Survey, Global Multi-resolution Terrain Elevation Data 2010 | Public domain (USGS) |
| GEBCO 2026 | GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa) | UK Open Government Licence v3.0 (CEDA); GEBCO's own terms (`GEBCO_Grid_terms_of_use.pdf` in the zip) place the grid in the public domain. Either way: acknowledge the source with the citation, do not suggest GEBCO endorses the use, and not for navigation |
| Sea ice | National Snow and Ice Data Center, Sea Ice Index, Version 4 (G02135) | NSIDC's data are free to use with citation of the data set (see its documentation at nsidc.org/data/g02135) |
| Surface wind and weather | NCEP/NCAR Reanalysis 1, NOAA PSL, Boulder, Colorado (Kalnay et al., 1996, Bull. Amer. Meteor. Soc. 77, 437-470) | NOAA data, free to use; PSL asks that it be acknowledged as "NCEP-NCAR Reanalysis 1 data provided by the NOAA PSL, Boulder, Colorado, USA, from their website at https://psl.noaa.gov" |
| Real clouds | NASA Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS); VIIRS (Suomi NPP, NOAA-20) and MODIS (Terra) Corrected Reflectance | NASA imagery, free to use with acknowledgement of GIBS |
| New Zealand imagery and DEM | Sourced from the LINZ Data Service: New Zealand 10m Satellite Imagery (2022-2023), NZ 8m Digital Elevation Model (2012) | CC BY 4.0 (attribution: "Toitū Te Whenua Land Information New Zealand") |
| Hawaii imagery (XHR) | Esri World Imagery (Esri, Maxar, Earthstar Geographics and the GIS user community) | Esri's terms of use: it may be displayed with attribution, but not redistributed as data. Do not publish the raw images or COGs; check the terms before shipping tiles baked from them |
| Hawaii ground cover | ESA WorldCover 10 m 2021 v200 (Zanaga, D. et al., 2022, doi:10.5281/zenodo.7254221) | CC BY 4.0 |
| Hawaii ground classification | Sentinel-2 cloudless 2024 (https://s2maps.eu) by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024) | CC BY-NC-SA 4.0 for the 2018 and later layers: used here only to classify the ground (not drawn); check the terms before commercial use |
| Hawaii terrain | Copernicus DEM GLO-30, © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA | Copernicus DEM licence (free, attribution required) |

## Committing LFS data without uploading it

New LFS data (a regional bake, or the textures) is committed like anything else: Git stores a pointer
and the data goes into the clone's own LFS store (`.git/lfs`). A clone without write credentials can
still push the commits, if it skips the upload: its pre-push hook (`.git/hooks/pre-push`, installed by
`git lfs install`, not committed) runs `GIT_LFS_SKIP_PUSH=1 git lfs pre-push "$@"` instead of
`git lfs pre-push "$@"`. For a single push instead:

```powershell
$env:GIT_LFS_SKIP_PUSH = 1; git push; Remove-Item Env:GIT_LFS_SKIP_PUSH
```

```sh
GIT_LFS_SKIP_PUSH=1 git push
```

Other clones then check out the pointers (setup's `lfs.skipdownloaderrors`), and the app falls back to
the tiles it has, until the data is uploaded. To upload it, from the clone that has the data, with write
credentials in that clone's own config (which take precedence over `.lfsconfig`; the URL is the one in
`.lfsconfig` with write credentials in place of the read-only ones):

```sh
git config --local lfs.pushurl "https://<write credentials>@<the .lfsconfig URL without its credentials>"
git lfs push philipswan 2026-claude-refactor   # LFS objects in commits that philipswan's branches lack
```

The same commands work in PowerShell. (`git lfs push --dry-run philipswan <branch>` lists them first.)
`lfs.pushurl` only changes where uploads go, so downloads can still come from `.lfsconfig` (or a local
mirror set in `lfs.url`). The store's proxy hands out an upload URL for every object asked about, even
ones it already holds, so a repeated or interrupted push sends everything again. Run `git fetch
philipswan` first, so the scan starts from the branches already there, and to resume a large upload,
push only the missing objects with `git lfs push --object-id --stdin philipswan` (an object is missing
when a 1-byte ranged GET of its batch-API download URL returns 404).

### Moving the textures into LFS

Only a few of the downloaded textures are used at run time (the Moon, clouds, logo, tube, solar panel,
steel and launch vehicle textures, `UnderwaterView.jpg` and the Olympus Mons images under `textures/mars`).
The rest (the `24x12` grids, `world.topo.*`, `bluemarble_*`, `DisplacementMaps`) are source data for the
tile bakes. To move them into LFS:

1. Remove `textures` from `.gitignore`, and track it in LFS: `git lfs track "textures/**"` (adds the
   pattern to `.gitattributes`).
2. `git add .gitattributes .gitignore textures` and commit; push, then upload them (above).
3. Once the bucket has them, remove the website download (below): `git lfs pull` then fetches the
   textures too.

### Clean-up once everything is in LFS

When the new texture architecture is complete and all its data (planet tile sets, runtime textures and the
source data the tile bakes are built from) is in Git LFS, nothing needs the project-atlantis.com download
any more. Remove all of it:

- `scripts/sync-textures.mjs`, and the `sync-textures` script in `package.json`.
- The texture download step (and its warning) in `scripts/setup.mjs`.
- The `textures` entry in `.gitignore` (the folder is then tracked in LFS).
- The mentions of the download: `README.md` (setup), `CLAUDE.md` (`textures/` is downloaded),
  `docs/ARCHITECTURE.md` (the folder list) and the top of this file.
- Defaults in the bake tools that point at source files under `textures/` (for example `COLOR_SOURCE` and
  `HEIGHT_SOURCE` in `tools/adaptive_lod.py`), once the bakes read the sources built by `tools/sources/`.
