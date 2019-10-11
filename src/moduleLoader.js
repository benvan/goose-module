import { put, takeEvery, all, take } from 'redux-saga/effects'
import {updateAt} from 'fn-update'


export const LOAD_MODULE = '@@goose/LOAD_MODULE'
export const loadModule = (Module) => ({
  type: LOAD_MODULE,
  module: Module
})

export const INIT_MODULE = '@@goose/INIT_MODULE'
export const initModule = (Module) => ({
  type: INIT_MODULE,
  module: Module
})

export const IS_LOADED = Symbol('goose: module-is-loaded')
const _loadedModules = new Set()

const chainReducers = (rs) => (state,action) => rs.reduce((st,r) => r(st,action), state)


const log = (...args) => {
  if (process.env.NODE_ENV === 'development'){
    console.log(...args)
  }
}

export const isLoaded = (Module) => {
  return _loadedModules.has(Module)
}

export const gooseMiddleware = store => next => action => {
  if (action.type === INIT_MODULE){
    action.module[IS_LOADED] = true
  }
  if (action.type !== LOAD_MODULE) {
    return next(action)
  }
}


const MatchHasLoaded = (Module) => (action) => action.type === INIT_MODULE && action.module === Module

function* doLoadModule(Module,sagaMiddleware,replaceReducer){
  if (process.env.NODE_ENV === 'development'){
    if (!Module.key) throw Error("You must provide a (unique) key for your module!")
  }

  if (!isLoaded(Module)){
    log(`Loading module "${Module.key}"`)
    _loadedModules.add(Module)
    if (Module.dependencies && Module.dependencies.length){
      log(`Ensuring dependencies loaded ("${Module.key}" -> [${Module.dependencies.map(m => `"${m.key}"`)}])`)

      for (const d of Module.dependencies){
        if (!d[IS_LOADED]){
          yield put(loadModule(d))
        }
      }

      // Wait for dependencies to load
      const missingDependencies = Module.dependencies.filter(m => !m[IS_LOADED])
      yield all(missingDependencies.map(d => take(MatchHasLoaded(d))))
    }

    const newReducers = [..._loadedModules].map(m => {
      if (m.root){
        // this reducer is specifically mounted at the root
        return m.reducer
      }else{
        // this reducer has a root key
        return (state,action) => updateAt(m.key,m.reducer(state[m.key],action))(state)
      }
    })
    replaceReducer(chainReducers(newReducers))
    yield put(initModule(Module))
    sagaMiddleware.run(Module.saga)
  }
}

export const bindGooseToSagaMiddleware = (sagaMiddleware,replaceReducer) => {
  sagaMiddleware.run(function*(){
    yield all([
      takeEvery(LOAD_MODULE, function*(action){ yield doLoadModule(action.module,sagaMiddleware,replaceReducer) })
    ])
  })
}
