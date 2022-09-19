import * as THREE from 'three';
//import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module.js';

export const makePlanetTexture = (planetMesh, orbitControls, camera, radiusOfPlanet, partial, callback) => {
    const osm = new ol.layer.Tile({
        extent: [-180, -90, 180, 90],
        source: new ol.source.XYZ({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            maxZoom: 19,
            crossOrigin: 'anonymous'
        })
    });

    const view = new ol.View({
        projection: "EPSG:4326",
        extent: [-180, -90, 180, 90],
        center: [0, 0],
        zoom: 2
    });

    const map = new ol.Map({
        layers: [
            new ol.layer.Tile({
                extent: [-180, -90, 180, 90],
                source: new ol.source.XYZ({
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    maxZoom: 2,
                    crossOrigin: 'anonymous'
                })
            }),
            osm,
        ],
        target: "map",
        view: view
    });

    map.on("rendercomplete", function () {

        console.log("test")

        const mapCanvas = document.createElement("canvas");
        const size = map.getSize();
        mapCanvas.width = size[0];
        mapCanvas.height = size[1];
        const mapContext = mapCanvas.getContext("2d");
        Array.prototype.forEach.call(
            document.querySelectorAll(".ol-layer canvas"),
            function (canvas) {
                if (canvas.width > 0) {
                    const opacity = canvas.parentNode.style.opacity;
                    mapContext.globalAlpha = opacity === "" ? 1 : Number(opacity);
                    const transform = canvas.style.transform;

                    const matrix = transform
                        .match(/^matrix\(([^\(]*)\)$/)[1]
                        .split(",")
                        .map(Number);

                    CanvasRenderingContext2D.prototype.setTransform.apply(
                        mapContext,
                        matrix
                    );
                    mapContext.drawImage(canvas, 0, 0);
                }
            }
        );

        const texture = new THREE.CanvasTexture(mapCanvas);
        callback(texture)

        if (document.getElementById("map").style.width === "4000px") return;

        document.getElementById("map").style.width = "4000px";
        document.getElementById("map").style.height = "2000px";
        map.updateSize();
        view.setResolution(0.18);
    });

    return
} 