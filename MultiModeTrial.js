  export class MultiModeTrial
{
  constructor() {
    this.active = false
    this.evtea = [5000, 6000, 8000, 12000]
    //this.evtea = [31750, 24000, 12000, 9000, 6000, 3000]
    //this.evtea = [31750, 24000, 12000]

    this.sk = 1
    this.nk = 8
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
    this.angleOfAscent = []
    for (let k = 0; k<this.nk-this.sk; k++) {
      this.massFraction[k] = []
      this.rocketTotalDeltaV[k] = []
      this.peakCentrifugalAcceleration[k] = []
      this.peakDecelleration[k] = []
      this.angleOfAscent[k] = []
    }
            
  }

  start() {
    this.active = true
    this.k = this.sk
    this.j = 0
    this.i = 0
    this.h = 0  
    this.massFraction = []
    this.rocketTotalDeltaV = []
    this.peakCentrifugalAcceleration = []
    this.peakDecelleration = []
    this.angleOfAscent = []
    for (let k = 0; k<this.nk-this.sk; k++) {
      this.massFraction[k] = []
      this.rocketTotalDeltaV[k] = []
      this.peakCentrifugalAcceleration[k] = []
      this.peakDecelleration[k] = []
      this.angleOfAscent[k] = []
    }

    //this.cache = JSON.parse('[[{"k":1,"j":0,"AoA":29},{"k":1,"j":1,"AoA":31},{"k":1,"j":2,"AoA":32},{"k":1,"j":3,"AoA":35}],[{"k":2,"j":0,"AoA":21},{"k":2,"j":1,"AoA":21},{"k":2,"j":2,"AoA":21},{"k":2,"j":3,"AoA":20}],[{"k":3,"j":0,"AoA":20},{"k":3,"j":1,"AoA":20},{"k":3,"j":2,"AoA":19},{"k":3,"j":3,"AoA":16}],[{"k":4,"j":0,"AoA":20},{"k":4,"j":1,"AoA":20},{"k":4,"j":2,"AoA":19},{"k":4,"j":3,"AoA":16}],[{"k":5,"j":0,"AoA":21},{"k":5,"j":1,"AoA":21},{"k":5,"j":2,"AoA":20},{"k":5,"j":3,"AoA":15}],[{"k":6,"j":0,"AoA":17},{"k":6,"j":1,"AoA":17},{"k":6,"j":2,"AoA":17},{"k":6,"j":3,"AoA":17}],[{"k":7,"j":0,"AoA":11},{"k":7,"j":1,"AoA":8},{"k":7,"j":2,"AoA":11},{"k":7,"j":3,"AoA":9}]]')
    this.cache = JSON.parse('[[{"k":1,"j":0,"AoA":30},{"k":1,"j":1,"AoA":30},{"k":1,"j":2,"AoA":32},{"k":1,"j":3,"AoA":35}],[{"k":2,"j":0,"AoA":21},{"k":2,"j":1,"AoA":21},{"k":2,"j":2,"AoA":20},{"k":2,"j":3,"AoA":20}],[{"k":3,"j":0,"AoA":19},{"k":3,"j":1,"AoA":19},{"k":3,"j":2,"AoA":18},{"k":3,"j":3,"AoA":16}],[{"k":4,"j":0,"AoA":20},{"k":4,"j":1,"AoA":19},{"k":4,"j":2,"AoA":17},{"k":4,"j":3,"AoA":15}],[{"k":5,"j":0,"AoA":20},{"k":5,"j":1,"AoA":19},{"k":5,"j":2,"AoA":17},{"k":5,"j":3,"AoA":15}],[{"k":6,"j":0,"AoA":15},{"k":6,"j":1,"AoA":15},{"k":6,"j":2,"AoA":14},{"k":6,"j":3,"AoA":14}],[{"k":7,"j":0,"AoA":11},{"k":7,"j":1,"AoA":11},{"k":7,"j":2,"AoA":10},{"k":7,"j":3,"AoA":9}]]')

  }

  checkCache() {
    let AoA = null
    if (this.cache.length>0) {
      this.cache.forEach(cacheRow => {
        cacheRow.forEach(cacheEntry => {
          if ((cacheEntry.k===this.k) && (cacheEntry.j===this.j)) {
            AoA = cacheEntry.AoA
          }
        })
      })
    }
    return AoA
  }

  nextTrial() {
    this.h = (this.h+1) % this.nh
    if (this.h===0) {
      // this.i = (this.i+1) % this.ni
      // if (this.i===0) {
        this.j = (this.j+1) % this.nj
        if (this.j===0) {
          this.k = this.sk + (this.k-this.sk+1) % (this.nk-this.sk)
          if (this.k===this.sk) {
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