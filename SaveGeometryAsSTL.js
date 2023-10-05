//import * as THREE from 'three'
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

// import { saveAs } from './FileSaver.js'
// import { saveAs } from 'file-saver';

export function define_SaveGeometryAsSTL() {
  return function (geometry, filename) {

    var exporter = new STLExporter();
    var str = exporter.parse( geometry ); // Export the screw geometry
    //console.log(str)
    
    var blob = new Blob( [str], { type : 'text/plain' } ); // Generate Blob from the string
    //saveAs( blob, 'file.stl' ); //Save the Blob to file.stl

    // var blob = new Blob([geometry.exportSTL()], {
    //   type: 'text/plain'
    // });
    // link.style.display = 'none';
    // document.body.appendChild(link);
    // link.href = URL.createObjectURL(blob);
    // link.download = 'Scene.stl';
    // link.click();

    var link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }
}