/*
  "Goose" is a concept that takes "ducks" a little bit further:
  https://github.com/erikras/ducks-modular-redux

  Basically, a goose module represents the logic of a component. This means:
   - the reducer
   - the side effects (saga)
   - the exposed actions + creators

  A goose module has the following form:
  {
    name: 'some-module',
    reducer: (state,action) => newState,
    saga: function*(){ ... },
    dependencies:[ ... other goose modules ... ]
  }

  Whenever a module gets loaded, its dependencies get loaded first.
  Its reducer gets added to the store, and its saga gets registered.

  Additionally, this file contains a few helpers to lessen the boilerplate
  of creating sagas and reducers
*/

import React from 'react'
import PropTypes from 'prop-types'
import {updateAt} from 'fn-update'
import {ReactReduxContext} from 'react-redux'

import * as ModuleLoader from './moduleLoader'

export * from './moduleLoader';

/*
  Allows you to express reducers in a key -> transformer form
  Where a transformer is (action) => (state) => newState
  This is especially handy when using fn-update for transformers

  It has the added benefit of exposing a map of supported actions by the reducer,
  which allows us to avoid evaluating unnecessary reducer actions

  A handler gets passed the `action` object - it can return:
   - [a function] - this transforms the state, e.g. updateAt('value',v => v+1)
   - [a value] - this directly replaces the state, e.g. {value:1}
   - [nothing] - this is a no-op

  e.g. this:
  const reducer = (state,action) => {
    switch (action.type){
      case ADDITION:
        return {...state, total: state.value + action.payload.value }
      case MULTIPLICATION:
        return {...state, total: state.value * action.payload.value }
      case RESET:
        return {value:0}
      default:
        return state
    }
  }

  becomes this:
  const reducer = Machine({
    [ADDITION]       : ({payload:{value}}) => updateAt('total',(x) => x+value),
    [MULTIPLICATION] : ({payload:{value}}) => updateAt('total',(x) => x*value)
    [RESET]          : () => ({value:0})
  })
}

*/
export const Machine = (definitions,rootKey=null) => {
  if (definitions[undefined]){
    console.error("Machine definition broken! One of your action keys is undefined.")
  }
  const rootPath = [rootKey].filter(Boolean)
  const thisMachine = (state,action) => {
    const def = definitions[action.type]
    if (!def) return state // No definition for this action. Ignore it.

    if (action.type === Machine.INIT && action.module.reducer !== thisMachine){
      // Ignore this - it's an INIT message meant for another module
      return state
    }
    
    if (def){
      try{
        const defResult = def(action)
        if (typeof defResult === 'function'){
          // apply state-transformer
          return updateAt(rootPath,defResult)(state)
        }else if(!defResult){
          // apply no-op
          return state
        }else{
          // I'm not sure whether to allow this or not.. If we decide to forbid it, here's a useful warning:
          // console.warn(`The Machine definition for ${action.type === Machine.INIT ? 'Machine.INIT' : action.type} did not return a function. This is almost certainly a mistake - did you mean to return Machine.result(<your-value>)? The value returned was:`,defResult)

          // apply direct result
          return updateAt(rootPath,defResult)(state)
        }
      }catch (e){
        console.error("Error in reducer for action: ",action)
        throw e
      }

    // this machine has no definition for this action
    }else return state
  }

  return thisMachine
}

Machine.at = (rootKey,definitions) => Machine(definitions,rootKey)
Machine.result = (result) => (state) => result
Machine.INIT = ModuleLoader.INIT_MODULE

export const MatchInit = (key) => {
  if (typeof key === 'object' && key.type){
    throw new Error("You must provide a module key to MatchInit!")
  }
  return (action) => Boolean(action.type === ModuleLoader.INIT_MODULE && action.module.key === key)
}

/* HOC to bind module loading logic into the mount / unmount of a container */
const ConnectedWithModuleWithContext = (Module, Component) => {
  
  const ConnectedWithModule = class ModuleLoadWrapper extends React.Component{
    static contextType = ReactReduxContext
    static propTypes = { context: PropTypes.object }
    static displayName = `ModuleLoadWrapper(${Module.key})`
    state = { moduleLoadObserved: Module[ModuleLoader.IS_LOADED] }
    render(){
      const {moduleLoadObserved} = this.state
      const _propsWithoutStore = Object.assign({},this.props)
      delete _propsWithoutStore.store
      if (moduleLoadObserved){
        return React.createElement(Component,_propsWithoutStore)
      }else{
        return null
      }
    }
    componentDidMount(...args){
      const store = this.context.store
      const {moduleLoadObserved} = this.state
      
      if (!moduleLoadObserved){
        const unsubscribe = store.subscribe((e) => {
          if (Module[ModuleLoader.IS_LOADED]){
            unsubscribe()
            this.setState({moduleLoadObserved:true})
          }
        })
        store.dispatch(ModuleLoader.loadModule(Module))
      }
    }
  }
  
  ConnectedWithModule.propTypes = {
    context: PropTypes.object,
  }
  
  return props => {
    const Context = props.context || ReactReduxContext
    if (Context == null) {
      throw 'Please upgrade to react-redux v6'
    }
    return (
      <Context.Consumer>
        {({ store }) => <ConnectedWithModule store={store} {...props} /> }
      </Context.Consumer>
    )
  }
}

export const withModule = Module => (Component) => ConnectedWithModuleWithContext(Module,Component)