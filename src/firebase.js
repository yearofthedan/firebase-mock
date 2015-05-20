'use strict'

import {posix as posixPath} from 'path'
import assert from 'assert'
import last from 'array-last'
import {ServerValue} from 'firebase-server-value'
import clock from './clock'
import Store from './store'
import * as map from './map'
import dispatch from './dispatch'
import {random as randomEndpoint, parse as parseUrl, format as formatUrl} from './url'

const {join, resolve} = posixPath

export default class MockFirebase {
  static cache = Store.cache
  static clock = clock
  static ServerValue = ServerValue
  constructor (url = randomEndpoint(), root) {
    Object.assign(this, parseUrl(url)) // eslint-disable-line no-undef
    if (this.isRoot) {
      this.store = new Store(this.endpoint).proxy(this)
      this.setData = (data) => {
        const diff = map.diff(this.data, data)
        this.data = data
        dispatch(this, this.listeners, diff)
      }
    } else {
      this._root = root || new this.constructor(this.endpoint)
    }
    if (!this.isRoot) this.queue = this.root().queue
  }
  flush () {
    this.queue.flush()
    return this
  }
  get keyPath () {
    return this.isRoot ? [] : this.path.split('/').slice(1)
  }
  getData () {
    return map.toJSIn(this.root().data, this.keyPath)
  }
  parent () {
    return this.isRoot ? null : new this.constructor(formatUrl({
      endpoint: this.endpoint,
      path: resolve(this.path, '..')
    }), this.root())
  }
  ref () {
    return this
  }
  root () {
    return this.isRoot ? this : this._root
  }
  child (path) {
    assert(path && typeof path === 'string', '"path" must be a string')
    if (path === '/') return this
    return new this.constructor(formatUrl({
      endpoint: this.endpoint,
      path: join(this.path, path)
    }), this.root())
  }
  key () {
    return last(this.path.split('/')) || null
  }
  toString () {
    return this.url
  }
  defer (callback) {
    this.queue.add(callback)
    return this
  }
  on (event, callback, cancel, context) {
    const path = this.path
    const listener = {event, callback, cancel, context, path}
    this.listeners.add(listener)
    if (calledOnRegister(event)) {
      this.defer(() => {
        if (!this.listeners.has(listener)) return
      })
    }
  }
  set (data) {
    this.defer(() => {
      const root = this.root()
      root.setData(root.data.setIn(this.keyPath, map.fromJS(data)))
    })
  }
}

function calledOnRegister (event) {
  return event === 'value' || event === 'child_added'
}
