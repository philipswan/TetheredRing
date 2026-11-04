// Materialize the completed framebuffer before yielding or submitting it to an encoder.
export class FrameCapture {
  constructor(renderer, canvas, width, height, bufferWidth = width, bufferHeight = height) {
    this.renderer = renderer
    this.canvas = canvas
    this.width = width
    this.height = height
    this.bufferWidth = bufferWidth
    this.bufferHeight = bufferHeight
    canvas.width = width
    canvas.height = height
    this.context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!this.context) throw new Error('Could not create the recording frame canvas.')
    this.pixels = new Uint8Array(width * height * 4)
    this.image = this.context.createImageData(width, height)
  }

  assertSize() {
    const gl = this.renderer.getContext()
    if (gl.isContextLost()) throw new Error('WebGL context lost during recording.')
    if (gl.drawingBufferWidth !== this.bufferWidth || gl.drawingBufferHeight !== this.bufferHeight) {
      throw new Error(`Recording drawing buffer changed: expected ${this.bufferWidth}x${this.bufferHeight}, got ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}.`)
    }
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      throw new Error('Recording output canvas changed size.')
    }
  }

  capture() {
    this.assertSize()
    if (this.renderer.getRenderTarget() !== null) throw new Error('Recording frame is not on the default framebuffer.')
    const gl = this.renderer.getContext()
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels)
    const error = gl.getError()
    if (error !== gl.NO_ERROR) throw new Error(`Recording pixel readback failed (WebGL error ${error}).`)
    const stride = this.width * 4
    const data = this.image.data
    for (let y = 0; y < this.height; y++) {
      const from = (this.height - 1 - y) * stride
      data.set(this.pixels.subarray(from, from + stride), y * stride)
    }
    // Preserve the rendered RGB, rather than compositing the sky's low alpha onto black.
    for (let i = 3; i < data.length; i += 4) data[i] = 255
    this.context.putImageData(this.image, 0, 0)
    return this.canvas
  }
}
