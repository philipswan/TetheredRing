  export class MultiModeTrial
{
  constructor() {
    this.active = false
    //this.evtea = [3000, 6000, 9000, 12000, 31750]
    this.evtea = [31750, 24000, 12000, 9000, 6000, 3000]
    //this.evtea = [31750]

    this.nk = 9
    this.nj = this.evtea.length
    this.ni = 20
    this.nh = 10
    this.k = 0
    this.j = 0
    this.i = 0
    this.h = 0

    // massfraction[exitVelocity][evacuatedTubeExitAltitude]
    this.massFraction = []
    this.rocketTotalDeltaV = []
    this.peakCentrifugalAcceleration = []
    this.peakDecelleration = []
    for (let k = 0; k<this.nk; k++) {
      this.massFraction[k] = []
      this.rocketTotalDeltaV[k] = []
      this.peakCentrifugalAcceleration[k] = []
      this.peakDecelleration[k] = []
    }
            
  }

  start() {
    this.active = true
    this.k = 0
    this.j = 0
    this.i = 0
    this.h = 0  
    this.massFraction = []
    this.rocketTotalDeltaV = []
    this.peakCentrifugalAcceleration = []
    this.peakDecelleration = []
    for (let k = 0; k<this.nk; k++) {
      this.massFraction[k] = []
      this.rocketTotalDeltaV[k] = []
      this.peakCentrifugalAcceleration[k] = []
      this.peakDecelleration[k] = []
    }
  }

  nextTrial() {
    this.h = (this.h+1) % this.nh
    if (this.h===0) {
      // this.i = (this.i+1) % this.ni
      // if (this.i===0) {
        this.j = (this.j+1) % this.nj
        if (this.j===0) {
          this.k = (this.k+1) % this.nk
          if (this.k===0) {
            this.active = false
          }
        }
      // }
    } 
  }

  lastTrial() {
    return (this.k===this.nk-1) && (this.j===this.nj-1) //&& (this.i===this.ni-1)
  }
}