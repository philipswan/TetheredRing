// console.log without the file:line link DevTools puts on each line, so that long printouts (the launch
// trajectory's and the engineering specs' summaries) read as clean tables. It logs from a microtask, which
// DevTools does not attribute to the calling line; the lines therefore come out after the current task's
// other console output, in the order they were printed.
export function print(...args) {
  queueMicrotask(console.log.bind(console, ...args))
}
