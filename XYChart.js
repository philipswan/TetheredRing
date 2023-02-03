import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// // First, we need to set up the scene and create a camera and a renderer

// const scene = new THREE.Scene();
// const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// const renderer = new THREE.WebGLRenderer();
// renderer.setSize(window.innerWidth, window.innerHeight);
// document.body.appendChild(renderer.domElement);

// // Next, we'll create the x and y axis lines and add them to the scene

// const xAxisGeometry = new THREE.Geometry();
// xAxisGeometry.vertices.push(new THREE.Vector3(-10, 0, 0));
// xAxisGeometry.vertices.push(new THREE.Vector3(10, 0, 0));
// const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
// const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
// scene.add(xAxis);

// const yAxisGeometry = new THREE.Geometry();
// yAxisGeometry.vertices.push(new THREE.Vector3(0, -10, 0));
// yAxisGeometry.vertices.push(new THREE.Vector3(0, 10, 0));
// const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
// const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
// scene.add(yAxis);

// // Then, we'll create the grid lines and add them to the scene

// const gridSize = 10;
// const gridStep = 1;

// for (let i = -gridSize; i <= gridSize; i += gridStep) {
//   const gridGeometry = new THREE.Geometry();
//   gridGeometry.vertices.push(new THREE.Vector3(-gridSize, i, 0));
//   gridGeometry.vertices.push(new THREE.Vector3(gridSize, i, 0));
//   const gridMaterial = new THREE.LineBasicMaterial({ color: 0xcccccc });
//   const gridLine = new THREE.Line(gridGeometry, gridMaterial);
//   scene.add(gridLine);
// }

// for (let i = -gridSize; i <= gridSize; i += gridStep) {
//   const gridGeometry = new THREE.Geometry();
//   gridGeometry.vertices.push(new THREE.Vector3(i, -gridSize, 0));
//   gridGeometry.vertices.push(new THREE.Vector3(i, gridSize, 0));
//   const gridMaterial = new THREE.LineBasicMaterial({ color: 0xcccccc });
//   const gridLine = new THREE.Line(gridGeometry, gridMaterial);
//   scene.add(gridLine);
// }

// // Finally, we'll create the axis labels and add them to the scene

// const xAxisLabel = createLabel("X", new THREE.Vector3(10, 0, 0), new THREE.Vector3(0, 0, 1), 0x0000ff);
// scene.add(xAxisLabel);

// const yAxisLabel = createLabel("Y", new THREE.Vector3(0, 10, 0


  // First, we will define some constants for the size and position of the graph
const GRAPH_WIDTH = 600;
const GRAPH_HEIGHT = 300;
const GRAPH_X_MIN = 0;
const GRAPH_X_MAX = 600;
const GRAPH_Y_MIN = 0;
const GRAPH_Y_MAX = 300;
const GRAPH_X_MIDDLE = (GRAPH_X_MIN + GRAPH_X_MAX) / 2;
const GRAPH_Y_MIDDLE = (GRAPH_Y_MIN + GRAPH_Y_MAX) / 2;
const X_STEP = 10;
const Y_STEP = 10;

export class XYChart {
  constructor (scene) {
    this.scene = scene
    this.chartGroup = new THREE.Group()
    this.scene.add(this.chartGroup)
    this.width = GRAPH_WIDTH
    this.height = GRAPH_HEIGHT
    this.curveInfo = []
  }

  // Next, we will create a function to draw the x and y axis lines and labels
  drawAxes() {
    // Calculate the scale factor for converting graph coordinates to pixel coordinates
    const xScale = GRAPH_WIDTH / (GRAPH_X_MAX - GRAPH_X_MIN);
    const yScale = GRAPH_HEIGHT / (GRAPH_Y_MAX - GRAPH_Y_MIN);

    // Create the x axis line and label
    const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(GRAPH_X_MIN, 0, 0), new THREE.Vector3(GRAPH_X_MAX, 0, 0)])
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFFF });
    const xAxisLine = new THREE.Line(xAxisGeometry, xAxisMaterial);
    this.chartGroup.add(xAxisLine);
    //const xAxisLabel = makeTextSprite("X", { fontsize: 32, borderColor: {r:1, g:1, b:1, a:1.0}, backgroundColor: {r:255, g:100, b:100, a:0.8} });
    //xAxisLabel.position.set(GRAPH_X_MAX + 0.5, 0, 0);
    //this.chartGroup.add(xAxisLabel);

    // Create the y axis line and label
    const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, GRAPH_Y_MIN, 0), new THREE.Vector3(0, GRAPH_Y_MAX, 0)]);
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
    const yAxisLine = new THREE.Line(yAxisGeometry, yAxisMaterial);
    this.chartGroup.add(yAxisLine);
    //const yAxisLabel = makeTextSprite("Y", { fontsize: 32, borderColor: {r:1, g:1, b:1, a:1.0}, backgroundColor: {r:255, g:100, b:100, a:0.8} });
    //yAxisLabel.position.set(0, GRAPH_Y_MAX + 0.5, 0);
    //this.chartGroup.add(yAxisLabel);

    // Create the grid lines and labels
    for (let x = GRAPH_X_MIN; x <= GRAPH_X_MAX; x+=X_STEP) {
      // Skip the middle line to leave room for the y axis label
      if (x === 0) {
        continue;
      }
      // Calculate the pixel coordinates of the grid line
      const xPos = (x - GRAPH_X_MIN) * xScale;
      // Create the grid line
      const gridLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, GRAPH_Y_MIN, 0), new THREE.Vector3(x, GRAPH_Y_MAX, 0)]);
      const gridLineMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
      const gridLine = new THREE.Line(gridLineGeometry, gridLineMaterial);
      this.chartGroup.add(gridLine);
      // Create the grid label
      // const gridLabel = makeTextSprite(x.toString(), { fontsize: 16, borderColor: {r:0, g:0, b:0, a:1.0}, backgroundColor: {r:255, g:100, b:100, a:0.8} });
      // gridLabel.position.set(x, 0, 0);
      // this.chartGroup.add(gridLabel);
    }
    for (let y = GRAPH_Y_MIN; y <= GRAPH_Y_MAX; y+=Y_STEP) {
      // Skip the middle line to leave room for the x axis label
      if (y === 0) {
        continue;
      }
      // Calculate the pixel coordinates of the grid line
      const yPos = (y - GRAPH_Y_MIN) * yScale;
      // Create the grid line
      const gridLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(GRAPH_X_MIN, y, 0), new THREE.Vector3(GRAPH_X_MAX, y, 0)]);
      const gridLineMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
      const gridLine = new THREE.Line(gridLineGeometry, gridLineMaterial);
      this.chartGroup.add(gridLine);
      // Create the grid label
      // const gridLabel = makeTextSprite(y.toString(), { fontsize: 16, borderColor: {r:0, g:0, b:0, a:1.0}, backgroundColor: {r:255, g:100, b:100, a:0.8} });
      // gridLabel.position.set(0, y, 0);
      // this.chartGroup.add(gridLabel);
    }
  }

  labelAxes() {
    const loader = new FontLoader();

    function prepareACallbackFunctionForFontFLoader(chart) {
      return function (font) {
        //console.log('Font Loaded', font)
        // x-axis lable
        const textGeometry = new TextGeometry( 'Time (??\'s of s)',
        {
          font: font,
          size: 20,
          height: 5,
          curveSegments: 12,
        } )
        const textMaterial = new THREE.MeshBasicMaterial({color: 0x808080, transparent: false})
        const textMesh = new THREE.Mesh(textGeometry, textMaterial)
        textMesh.position.set(200, -30, 0)  // ToDo: calculate this based on chart dimension and position
        chart.add(textMesh)

        // y-axis lable

        // x-axis numbers

        // y-axis numbers

        // legend

        // title

      }
    }
  
    loader.load( 'node_modules/three/examples/fonts/droid/droid_sans_regular.typeface.json', prepareACallbackFunctionForFontFLoader(this.chartGroup))
  }

  addCurve(curveName, curveUnits, curveXYPoints, curveColor, curveColorName) {
    let maxX = 0.001
    let maxY = 0.001
    let maxZ = 0.001
    curveXYPoints.forEach(point => {
      maxX = Math.max(point.x, maxX)
      maxY = Math.max(point.y, maxY)
      maxZ = Math.max(point.z, maxZ)
    })

    // For now we'll assume that the minimums are always zero
    curveXYPoints.forEach(point => {
      point.x *= GRAPH_X_MAX / maxX
      point.y *= GRAPH_Y_MAX / maxY
      point.z *= 100 / maxZ
    })
    
    const existingCurves = this.curveInfo.map(function (o) {return o.name})
    if (existingCurves.includes(curveName)) {
      const index = existingCurves.indexOf(curveName)
      const curveLine = this.curveInfo[index].mesh
      // Recreate the line's geometry using the new points
      curveLine.geometry.setFromPoints(curveXYPoints)
      //curveLine.material.color = curveColor
      this.curveInfo[index] = {name: curveName, units: curveUnits, colorName: curveColorName, maxX: maxX, maxY: maxY, maxZ: maxZ, mesh: curveLine}
    }
    else {
      const curveGeometry = new THREE.BufferGeometry().setFromPoints(curveXYPoints);
      const curveMaterial = new THREE.LineBasicMaterial({ color: curveColor });
      const curveLine = new THREE.Line(curveGeometry, curveMaterial);
      this.chartGroup.add(curveLine);
      this.curveInfo.push({name: curveName, units: curveUnits, colorName: curveColorName, maxX: maxX, maxY: maxY, maxZ: maxZ, mesh: curveLine})
    }
  }
}
