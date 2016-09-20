import Firebase from 'firebase'
import LRU from 'lru-cache'
import config from '../config';

const inBrowser = typeof window !== 'undefined'
const apiURL = `${config.host}:${config.api.port}`;

// When using bundleRenderer, the server-side application code runs in a new
// context for each request. To allow caching across multiple requests, we need
// to attach the cache to the process which is shared across all requests.
const cache = inBrowser
  ? null
  : (process.__API_CACHE__ || (process.__API_CACHE__ = createCache()))

function createCache () {
  return LRU({
    max: 1000,
    maxAge: 1000 * 60 * 15 // 15 min cache
  })
}

// create a single api instance for all server-side requests
const api = inBrowser
  ? new Firebase('https://hacker-news.firebaseio.com/v0')
  : (process.__API__ || (process.__API__ = createServerSideAPI()))

function createServerSideAPI () {
  const api = new Firebase('https://hacker-news.firebaseio.com/v0')

  // cache the latest story ids
  api.__ids__ = {}
  ;['top', 'new', 'show', 'ask', 'job'].forEach(type => {
    api.child(`${type}stories`).on('value', snapshot => {
      api.__ids__[type] = snapshot.val()
    })
  })

  // warm the front page cache every 15 min
  warmCache()
  function warmCache () {
    fetchItems((api.__ids__.top || []).slice(0, 30))
    setTimeout(warmCache, 1000 * 60 * 15)
  }

  return api
}

function _fetch (child) {
  if (cache && cache.has(child)) {
    return Promise.resolve(cache.get(child))
  } else {
    return new Promise((resolve, reject) => {
      api.child(child).once('value', snapshot => {
        const val = snapshot.val()
        // mark the timestamp when this item is cached
        val.__lastUpdated = Date.now()
        cache && cache.set(child, val)
        resolve(val)
      }, reject)
    })
  }
}

export function fetchIdsByType (type) {
  return api.__ids__ && api.__ids__[type]
    ? Promise.resolve(api.__ids__[type])
    : fetch(`${type}stories`)
}

export function fetchItem (id) {
  return fetch(`item/${id}`)
}

export function fetchItems (ids) {
  return Promise.all(ids.map(id => fetchItem(id)))
}

export function fetchUser (id) {
  return fetch(`user/${id}`)
}

export function watchList (type, cb) {
  let first = true
  const ref = api.child(`${type}stories`)
  const handler = snapshot => {
    if (first) {
      first = false
    } else {
      cb(snapshot.val())
    }
  }
  ref.on('value', handler)
  return () => {
    ref.off('value', handler)
  }
}

export function fetchPosts() {
  console.log('apiURL:', apiURL)
  return fetch(`${apiURL}/posts`)
}

function fetch(endpoint) {

}
