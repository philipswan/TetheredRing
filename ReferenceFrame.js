export class referenceFrame {
	constructor(curve, numWedges, cameraRange, velocity, direction, trackIndex, name) {
		this.curve = curve  // This is the curve along which objects will be placed
		this.numWedges = numWedges  // This is the number of regions that we'll divide the entired reference frame into to do dynamic object allocation.
		this.cameraRange = cameraRange  // This is the range of the camera, in meters, that we'll use to determine which wedges are close enough to have visible objects in them
		this.p = 0  // This is the position of the reference frame around the curve, assuming that the curve is closed
		this.v = velocity  // This is the velocity that the reference frame travls around the curve (ToDo: Should be speed)
		this.direction = direction
		this.trackIndex = trackIndex
		this.name = name
		this.startWedgeIndex = -1
		this.finishWedgeIndex = -1
		this.prevStartWedgeIndex = -1
		this.prevFinishWedgeIndex = -1
		this.placeholderEntries = {}
	}

	addVirtualObject( virtualObjectName ) {
		this.placeholderEntries[virtualObjectName] = []
	}

	initialize() {
		// In each frame-of-reference, create an array of wedges. In each wedge, create an empty array for storing the virtual objects in that wedge
		const makeEmptyArrays = () => { return structuredClone(this.placeholderEntries) }
		this.wedges = new Array(this.numWedges).fill().map(makeEmptyArrays)
	}

	update(curve) {
		this.curve = curve
	}
}
