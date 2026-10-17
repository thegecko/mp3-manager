import { DragDropMonitorImpl } from './drag-drop-monitor';
import { HandlerRegistryImpl } from './handler-registry';
const BEGIN_DRAG = 'BEGIN';
const DROP = 'DROP';
const END_DRAG = 'END';
const HOVER = 'HOVER';
const initialDragOperation = { itemType: null, item: null, sourceId: null, targetIds: [] };
function matchesType(targetType, draggedItemType) {
    if (draggedItemType === null) {
        return targetType === null;
    }
    return Array.isArray(targetType) ? targetType.some((t)=>t === draggedItemType) : targetType === draggedItemType;
}
function createBeginDrag(manager) {
    return function beginDrag(sourceIds = []) {
        const monitor = manager.getMonitor();
        const registry = manager.getRegistry();
        if (monitor.isDragging()) {
            return;
        }
        const sourceId = sourceIds[sourceIds.length - 1];
        if (!sourceId) {
            return;
        }
        const source = registry.getSource(sourceId);
        const item = source.beginDrag(monitor, sourceId);
        if (item == null) {
            return undefined;
        }
        const itemType = registry.getSourceType(sourceId);
        return {
            type: BEGIN_DRAG,
            payload: {
                itemType,
                item,
                sourceId
            }
        };
    };
}
function createEndDrag(manager) {
    return function endDrag() {
        const monitor = manager.getMonitor();
        const registry = manager.getRegistry();
        if (!monitor.isDragging()) {
            return;
        }
        const sourceId = monitor.getSourceId();
        if (sourceId != null) {
            const source = registry.getSource(sourceId);
            source.endDrag(monitor, sourceId);
        }
        return {
            type: END_DRAG
        };
    };
}
function createDrop(manager) {
    return function drop() {
        const monitor = manager.getMonitor();
        const registry = manager.getRegistry();
        if (!monitor.isDragging()) {
            return;
        }
        const targetIds = monitor.getTargetIds().filter(monitor.canDropOnTarget, monitor).reverse();
        targetIds.forEach((targetId)=>{
            const target = registry.getTarget(targetId);
            if (target) {
                target.drop(monitor, targetId);
            }
            manager.dispatch({ type: DROP });
        });
    };
}
function createHover(manager) {
    return function hover(targetIdsArg) {
        const targetIds = targetIdsArg.slice(0);
        const monitor = manager.getMonitor();
        const registry = manager.getRegistry();
        const draggedItemType = monitor.getItemType();
        removeNonMatchingTargetIds(targetIds, registry, draggedItemType);
        hoverAllTargets(targetIds, monitor, registry);
        return {
            type: HOVER,
            payload: {
                targetIds
            }
        };
    };
}
function removeNonMatchingTargetIds(targetIds, registry, draggedItemType) {
    for(let i = targetIds.length - 1; i >= 0; i--){
        const targetId = targetIds[i];
        const targetType = registry.getTargetType(targetId);
        if (!matchesType(targetType, draggedItemType)) {
            targetIds.splice(i, 1);
        }
    }
}
function hoverAllTargets(targetIds, monitor, registry) {
    targetIds.forEach(function(targetId) {
        const target = registry.getTarget(targetId);
        if (target) {
            target.hover(monitor, targetId);
        }
    });
}
function reduce(state = { dragOperation: initialDragOperation, stateId: 0 }, action) {
    const payload = action.payload || {};
    let dragOperation = state.dragOperation;
    switch(action.type){
        case BEGIN_DRAG:
            dragOperation = { ...dragOperation, itemType: payload.itemType, item: payload.item, sourceId: payload.sourceId };
            break;
        case HOVER:
            dragOperation = { ...dragOperation, targetIds: payload.targetIds };
            break;
        case DROP:
            dragOperation = { ...dragOperation, targetIds: [] };
            break;
        case END_DRAG:
            dragOperation = initialDragOperation;
            break;
    }
    return { dragOperation, stateId: state.stateId + 1 };
}
function createStore(reducer) {
    let state;
    let listeners = [];
    const store = {
        dispatch(action) {
            state = reducer(state, action);
            for (const listener of listeners.slice()) listener();
            return action;
        },
        getState() {
            return state;
        },
        subscribe(listener) {
            listeners.push(listener);
            return () => {
                listeners = listeners.filter((item)=>item !== listener);
            };
        }
    };
    store.dispatch({ type: '@@redux/INIT' });
    return store;
}
class DragDropManagerImpl {
    receiveBackend(backend) {
        this.backend = backend;
        this.backend.setup();
    }
    getMonitor() {
        return this.monitor;
    }
    getBackend() {
        return this.backend;
    }
    getRegistry() {
        return this.monitor.registry;
    }
    getActions() {
        const bind = (actionCreator)=>(...args)=>{
            const action = actionCreator.apply(this, args);
            if (typeof action !== 'undefined') {
                this.store.dispatch(action);
            }
        };
        return {
            beginDrag: bind(createBeginDrag(this)),
            hover: bind(createHover(this)),
            drop: bind(createDrop(this)),
            endDrag: bind(createEndDrag(this))
        };
    }
    dispatch(action) {
        this.store.dispatch(action);
    }
    constructor(store, monitor){
        this.store = store;
        this.monitor = monitor;
    }
}
export function createDragDropManager(backendFactory) {
    const store = createStore(reduce);
    const monitor = new DragDropMonitorImpl(store, new HandlerRegistryImpl());
    const manager = new DragDropManagerImpl(store, monitor);
    const backend = backendFactory(manager);
    manager.receiveBackend(backend);
    return manager;
}
