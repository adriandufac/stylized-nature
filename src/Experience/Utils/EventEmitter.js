export default class EventEmitter {
  constructor() {
    this.callbacks = {}
  }

  on(name, callback) {
    if (!this.callbacks[name]) this.callbacks[name] = []
    this.callbacks[name].push(callback)
    return this
  }

  off(name) {
    delete this.callbacks[name]
    return this
  }

  trigger(name, args = []) {
    if (!this.callbacks[name]) return
    for (const callback of this.callbacks[name]) {
      callback.apply(this, args)
    }
  }
}
