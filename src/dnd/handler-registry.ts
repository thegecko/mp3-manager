const asap = (fn)=>queueMicrotask ? queueMicrotask(fn) : setTimeout(fn, 0);

let nextUniqueId = 0;

function getNextHandlerId(prefix) {
    return `${prefix}${nextUniqueId++}`;
}

export class HandlerRegistryImpl {
    addSource(type, source) {
        const sourceId = getNextHandlerId('S');
        this.types.set(sourceId, type);
        this.dragSources.set(sourceId, source);
        return sourceId;
    }
    addTarget(type, target) {
        const targetId = getNextHandlerId('T');
        this.types.set(targetId, type);
        this.dropTargets.set(targetId, target);
        return targetId;
    }
    getSource(sourceId) {
        return this.dragSources.get(sourceId);
    }
    getTarget(targetId) {
        return this.dropTargets.get(targetId);
    }
    getSourceType(sourceId) {
        return this.types.get(sourceId);
    }
    getTargetType(targetId) {
        return this.types.get(targetId);
    }
    removeSource(sourceId) {
        asap(()=>{
            this.dragSources.delete(sourceId);
            this.types.delete(sourceId);
        });
    }
    removeTarget(targetId) {
        this.dropTargets.delete(targetId);
        this.types.delete(targetId);
    }
    constructor(){
        this.types = new Map();
        this.dragSources = new Map();
        this.dropTargets = new Map();
    }
}
