import * as THREE from 'three'
import { dynamicallyManagedObject } from './dynamicallymanagedobject.js'

export class testObject extends dynamicallyManagedObject() {

  constructor() {
    super()
    this.p = 0.5
    this.unallocatedModels = []
  }

  update() {

  }
  
}