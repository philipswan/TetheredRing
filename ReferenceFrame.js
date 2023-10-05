export class referenceFrame {
	constructor(curve, numWedges, cameraRange, velocity, direction, trackIndex, name) {
		this.curve = curve  // This is the curve along which objects will be placed
		this.numWedges = numWedges  // This is the number of regions that we'll divide the entired reference frame into to do dynamic object allocation.
		this.cameraRange = cameraRange  // This is the range of the camera, in meters, that we'll use to determine which wedges are close enough to have visible objects in them
		this.p = 0  // This is the position of the reference frame around the curve, assuming that the curve is closed
		this.v = velocity  // This is the velocity that the reference frame travels around the curve (ToDo: Should be speed)
		this.direction = direction
		this.trackIndex = trackIndex
		this.name = name
		this.startWedgeIndex = -1
		this.finishWedgeIndex = -1
		this.prevStartWedgeIndex = -1
		this.prevFinishWedgeIndex = -1
		this.placeholderEntries = {}
	}

	initialize() {

		// We need a rapid wedge to curve mapping
		// We need a rapid time to wedge mapping

		// In each frame-of-reference, create an array of wedges. In each wedge, create an empty array for storing the virtual objects in that wedge
		const makeEmptyArrays = () => { return structuredClone(this.placeholderEntries) }
		this.wedges = new Array(this.numWedges).fill().map(makeEmptyArrays)

	}

	addVirtualObject( virtualObjectName ) {
		this.placeholderEntries[virtualObjectName] = []
	}

	update() {

		// We need to map the wedges to the individual curves in the list of curves
		if (Array.isArray(this.curve)) {
			if (this.curve.length==0) console.log("Error: Array length cannot be zero")
			this.numWedgesPerCurve = []
			let curvesTotalLength = 0
			this.curve.forEach(subCurve => { curvesTotalLength += Math.abs(subCurve.getLength()) })
			const wedgeRoughLength = curvesTotalLength / this.numWedges
			const numCurveSegments = this.curve.length
			// Make sure that every curve gets assigned at least one segment
			let newNumWedges = 0
			const numWedgesPerCurve = []
			this.curve.forEach((subCurve, index) => {
				const subCurveLength = Math.abs(subCurve.getLength())
				this.numWedgesPerCurve[index] = 1 + Math.max(0, Math.round((this.numWedges - numCurveSegments) * (subCurveLength - wedgeRoughLength) / (curvesTotalLength - numCurveSegments * wedgeRoughLength)))
				newNumWedges += this.numWedgesPerCurve[index]
			})
			// Hack
			// Adjust the number of wedges assigned to the last curve so that the total number of wedges is unchanged
			this.numWedgesPerCurve[-1] += this.numWedges - newNumWedges
		}

	}
}
