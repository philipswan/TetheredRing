export function outputFolderPath(value, folderName) {
  let path = value.trim()
  if ([...path].some(char => char.charCodeAt(0) < 32)) throw new Error('Enter an absolute output-folder path without control characters.')
  const windows = /^[a-z]:[\\/]|^\\\\|^\/\//i.test(path)
  if (windows) {
    path = path.replace(/\//g, '\\')
    if (!/^[a-z]:\\|^\\\\[^\\]+\\[^\\]+(?:\\|$)/i.test(path) || /[<>"|?*]/.test(path) || /:/.test(path.slice(2))) {
      throw new Error('Enter an absolute output-folder path, such as C:\\Videos.')
    }
    path = /^[a-z]:\\+$/i.test(path) ? path.slice(0, 3) : path.replace(/\\+$/, '')
  }
  else {
    if (!path.startsWith('/')) throw new Error('Enter an absolute output-folder path.')
    path = path.replace(/\/+$/, '')
  }
  const leaf = path.split(windows ? '\\' : '/').at(-1)
  if (folderName && (windows ? leaf.toLowerCase() !== folderName.toLowerCase() : leaf !== folderName)) {
    throw new Error(`The path must end with the selected folder name "${folderName}". The browser cannot verify the rest of the path.`)
  }
  return path || '/'
}

export function reviewVideoPath(folder, fileName) {
  if (!folder) return fileName
  return `${folder.replace(/[\\/]+$/, '')}${/^[a-z]:|^\\\\/i.test(folder) ? '\\' : '/'}${fileName}`
}

export function reviewVideoName(fileName, frames, timestamp = Date.now()) {
  return fileName.replace(/\.(mp4|mkv)$/, `.review-${frames}-${timestamp}.$1`)
}

export class RenderReview {
  constructor() {
    this.requested = false
    this.running = false
  }

  request() {
    if (this.requested || this.running) return false
    this.requested = true
    return true
  }

  async service(recorder, showReview) {
    if (!this.requested || this.running) return
    this.requested = false
    this.running = true
    try {
      await recorder?.checkpoint()
      await showReview()
    }
    finally { this.running = false }
  }
}
