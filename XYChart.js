import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// First, we will define some constants for the size and position of the graph
const X_STEP = 10;
const Y_STEP = 10;

export class XYChart extends THREE.Group {
  constructor () {
    super()

    this.width = 1000
    this.height = 300
    this.minX = 0
    this.minY = 0
    this.maxX = 1000
    this.maxY = 300
    this.majorX = 100
    this.majorY = 100
    this.minorX = 10
    this.minorY = 10
    this.logarithmicX = false
    this.logarithmicY = false

    this.curveInfo = []
    this.font = null
    this.textDescriptions = []
    this.labelTextHeight = 14
    this.labelTextSpacing = 24
    this.gridLabelsFontSize = 14
    this.yAxisLabelsWidth = 80

    const loader = new FontLoader();

    function prepareACallbackFunctionForFontFLoader(chart) {
      return function (font) {
        chart.font = font
        chart.renderText()
      }
    }
  
    loader.load( 'node_modules/three/examples/fonts/droid/droid_sans_regular.typeface.json', prepareACallbackFunctionForFontFLoader(this))

  }

  setWidth(width) {
    this.width = width
  }
  
  setHeight(height) {
    this.height = height
  }

  setMinX(minX) {
    this.minX = minX
  }

  setMaxX(maxX) {
    this.maxX = maxX
  }

  setMinY(minY) {
    this.minY = minY
  }
  
  setMaxY(maxY) {
    this.maxY = maxY
  }

  setMajorX(majorX) {
    this.majorX = majorX
  }

  setMajorY(majorY) {
    this.majorY = majorY
  }
  
  setMinorX(minorX) {
    this.minorX = minorX
  }

  setMinorY(minorY) {
    this.minorY = minorY
  }
  
  renderText() {

    while (this.textDescriptions.length) {
      const textDescription = this.textDescriptions.pop()
      let xAnchor, yAnchor
      switch (textDescription.anchor) {
        case 'top': xAnchor = 0.5; yAnchor = 1; break
        case 'right': xAnchor = 1; yAnchor = 0.5; break
        case 'bottom': xAnchor = 0.5; yAnchor = 0; break
        case 'left': xAnchor = 0; yAnchor = 0.5; break
        case 'center': xAnchor = 0.5; yAnchor = 0.5; break
        case 'top-left': xAnchor = 0; yAnchor = 1; break
        case 'top-right': xAnchor = 1; yAnchor = 1; break
        case 'bottom-left': xAnchor = 0; yAnchor = 0; break
        case 'bottom-right': xAnchor = 1; yAnchor = 0; break
        default: xAnchor = 0; yAnchor = 0; break
      }
      const textGeometry = new TextGeometry( textDescription.text,
      {
        font: this.font,
        size: textDescription.fontSize || 20,
        height: 5,
        curveSegments: 12,
      } )
      textGeometry.computeBoundingBox()
      const bbox = textGeometry.boundingBox
      const textWidth = bbox.max.x - bbox.min.x
      const textHeight = bbox.max.y - bbox.min.y
      textGeometry.translate(-xAnchor*textWidth, -yAnchor*textHeight, 0)
      const textMaterial = new THREE.MeshBasicMaterial({color: textDescription.color, transparent: false})
      const textMesh = new THREE.Mesh(textGeometry, textMaterial)
      textMesh.position.set(textDescription.x, textDescription.y, 0)  // ToDo: calculate this based on chart dimension and position
      // Now rotatate the text around the anchor point
      textMesh.rotation.z = textDescription.rotation
      textMesh.name = textDescription.name
      // set the ancor point for the text
      this.add(textMesh)
    }

  }

  // Next, we will create a function to draw the x and y axis lines and labels
  drawAxes() {
    // Calculate the scale factor for converting graph coordinates to pixel coordinates
    const xScale = this.width / (this.maxX - this.minX);
    const yScale = this.height / (this.maxY - this.minY);

    // Create the x axis line and label
    const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(this.minX*xScale, 0, 0), new THREE.Vector3(this.maxX*xScale, 0, 0)])
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0 });
    const xAxisLine = new THREE.Line(xAxisGeometry, xAxisMaterial);
    this.add(xAxisLine);
    //const xAxisLabel = makeTextSprite("X", { fontsize: 32, borderColor: {r:1, g:1, b:1, a:1.0}, backgroundColor: {r:255, g:100, b:100, a:0.8} });
    //xAxisLabel.position.set(this.maxX + 0.5, 0, 0);
    //this.add(xAxisLabel);

    // Create the y axis line and label
    const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, this.minY*yScale, 0), new THREE.Vector3(0, this.maxY*yScale, 0)]);
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0 });
    const yAxisLine = new THREE.Line(yAxisGeometry, yAxisMaterial);
    this.add(yAxisLine);
    //const yAxisLabel = makeTextSprite("Y", { fontsize: 32, borderColor: {r:1, g:1, b:1, a:1.0}, backgroundColor: {r:255, g:100, b:100, a:0.8} });
    //yAxisLabel.position.set(0, this.maxY + 0.5, 0);
    //this.add(yAxisLabel);
  }

  drawGridlines() {
    const xScale = this.width / (this.maxX - this.minX);
    const yScale = this.height / (this.maxY - this.minY);
    const gridLineMaterial = new THREE.LineBasicMaterial({ color: 0x606060 });

    // Create the grid lines and labels
    for (let x = this.minX; x <= this.maxX; x += this.majorX) {
      // Skip the middle line to leave room for the y axis label
      if (x === 0) {
        continue;
      }
      // Calculate the pixel coordinates of the grid line
      const xPos = (x - this.minX) * xScale;
      // Create the grid line
      const gridLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xPos, this.minY*yScale, -1), new THREE.Vector3(xPos, this.maxY*yScale, -1)]);
      const gridLine = new THREE.Line(gridLineGeometry, gridLineMaterial);
      this.add(gridLine);
      // Create a text description for the grid label and specify that that the anchor point should be on the right.
      this.textDescriptions.push({text: x.toString(), name: 'y-axis labels', x: xPos, y: -4, rotation: 0, fontSize: this.gridLabelsFontSize, color: 0x808080, anchor: 'top'})
    }
    for (let y = this.minY; y <= this.maxY; y += this.majorY) {
      // Skip the middle line to leave room for the x axis label
      if (y === 0) {
        continue;
      }
      // Calculate the pixel coordinates of the grid line
      const yPos = (y - this.minY) * yScale;
      // Create the grid line
      const gridLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(this.minX*xScale, yPos, -1), new THREE.Vector3(this.maxX*xScale, yPos, -1)]);
      const gridLine = new THREE.Line(gridLineGeometry, gridLineMaterial);
      this.add(gridLine);
      // Create a text description for the grid label and specify that that the anchor point should be on the right.
      this.textDescriptions.push({text: y.toString(), name: 'y-axis labels', x: -4, y: yPos, rotation: 0, fontSize: this.gridLabelsFontSize, color: 0x808080, anchor: 'right'})
    }
  }

  drawVerticalLine(xValue, labelText, color, labelYOffset=0, fontSize) {
    // Calculate the scale factor for converting graph coordinates to pixel coordinates
    const xScale = this.width / (this.maxX - this.minX);
    const yScale = this.height / (this.maxY - this.minY);

    // Create the vertical line and label
    const x = (xValue-this.minX)*xScale
    const y0 = this.minY*yScale
    const y1 = this.maxY*yScale + (labelYOffset+0.25) * this.labelTextSpacing
    const y2 = y1 + this.labelTextHeight
    const vericalLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y0, 0), new THREE.Vector3(x, y2, 0)]);
    const vericalLineMaterial = new THREE.LineBasicMaterial({ color: color});
    const vericalLineLine = new THREE.Line(vericalLineGeometry, vericalLineMaterial);
    this.add(vericalLineLine);
    this.textDescriptions.push({text: labelText, name: 'x-axis', x: x + 1, y: y1, rotation: 0, fontSize, color})
  }

  labelAxes(xAxisText, yAxisText) {

    // x-axis label
    this.textDescriptions.push({text: xAxisText, name: 'x-axis', color: "gray", x: this.width/2, y: -30, rotation: 0, anchor:'top'})

    // y-axis label
    this.textDescriptions.push({text: yAxisText, name: 'y-axis', color: "gray", x: -this.yAxisLabelsWidth, y: this.height/2, rotation: Math.PI/2, anchor:'bottom'})

    if (this.font!==null) {
      this.renderText()
    }
  }

  setLegendPosition(x, y) {
    this.legendX = x
    this.legendY = y
  }
  
  drawLegend(fontSize=18, legendTextSpacing=24) {

    const n = this.curveInfo.length
    this.curveInfo.forEach((curve, i) => {
       this.textDescriptions.push({text: curve.legendText, name: 'legend', x: this.legendX+4, y: this.legendY+legendTextSpacing*(n-i), fontSize: fontSize, rotation: 0, anchor:'bottom-left', color: curve.color})
    })

    if (this.font!==null) {
      this.renderText()
    }
  }



  clearCurves() {
    this.curveInfo.forEach(curve => {
      this.remove(this.getObjectByName(curve.name+'_label'))
      this.remove(curve.mesh)
    })
    this.curveInfo = []
  }

  addCurve(curveName, curveUnits, curveXYPoints, curveColor, curveColorName, legendText) {

    const xScale = this.width / (this.maxX - this.minX);
    const yScale = this.height / (this.maxY - this.minY);

    let alreadyReported = false
    let lastUnculledPoint = null
    let culledCurvePoints = []
    curveXYPoints.forEach(point => {
      if (!isFinite(point.x) || !isFinite(point.y) || !isFinite(point.z)) {
        if (!alreadyReported) {
          console.error('Non-finite value detected in curve points for '+curveName+'.')
          alreadyReported = true
        }
        point.y = 0
      }
      else {
        if ((point.x >= this.minX) && (point.x <= this.maxX) && (point.y >= this.minY) && (point.y <= this.maxY)) {
          const currentPoint = new THREE.Vector3((point.x-this.minX)*xScale, (point.y-this.minY)*yScale, 0)
          if (!lastUnculledPoint || (lastUnculledPoint.distanceToSquared(currentPoint) > 0.5)) {
            lastUnculledPoint = currentPoint
            culledCurvePoints.push(currentPoint)
          }
        }
      }
    })

    const existingCurves = this.curveInfo.map(function (o) {return o.name})
    let curveLine = null
    if (existingCurves.includes(curveName)) {
      const index = existingCurves.indexOf(curveName)
      curveLine = this.curveInfo[index].mesh
      // Recreate the line's geometry using the new points
      curveLine.geometry.setFromPoints(culledCurvePoints)
      //curveLine.material.color = curveColor
      this.curveInfo[index] = {name: curveName, units: curveUnits, color: curveColor, colorName: curveColorName, legendText: legendText, maxX: this.maxX, maxY: this.maxY, maxZ: 0, mesh: curveLine}
    }
    else {
      const curveGeometry = new THREE.BufferGeometry().setFromPoints(culledCurvePoints);
      const curveMaterial = new THREE.LineBasicMaterial({ color: curveColor });
      curveLine = new THREE.Line(curveGeometry, curveMaterial);
      curveLine.name = curveName
      this.add(curveLine);
      this.curveInfo.push({name: curveName, units: curveUnits, color: curveColor, colorName: curveColorName, legendText: legendText, maxX: this.maxX, maxY: this.maxY, maxZ: 0, mesh: curveLine})
    }
    curveLine.geometry.computeBoundingSphere() // This checks for invalid values in the geometry

  }
}
