function matchesType(targetType, draggedItemType) {
    if (draggedItemType === null) {
        return targetType === null;
    }
    return Array.isArray(targetType) ? targetType.some((t)=>t === draggedItemType) : targetType === draggedItemType;
}

export class DragDropMonitorImpl {
    subscribeToStateChange(listener) {
        let prevStateId = this.store.getState().stateId;
        const handleChange = ()=>{
            const currentStateId = this.store.getState().stateId;
            try {
                if (currentStateId !== prevStateId) {
                    listener();
                }
            } finally{
                prevStateId = currentStateId;
            }
        };
        return this.store.subscribe(handleChange);
    }
    canDropOnTarget(targetId) {
        // undefined on initial render
        if (!targetId) {
            return false;
        }
        if (!this.isDragging()) {
            return false;
        }
        const targetType = this.registry.getTargetType(targetId);
        const draggedItemType = this.getItemType();
        return matchesType(targetType, draggedItemType);
    }
    isDragging() {
        return Boolean(this.getItemType());
    }
    isDraggingSource(sourceId) {
        // undefined on initial render
        if (!sourceId) {
            return false;
        }
        const source = this.registry.getSource(sourceId);
        if (!this.isDragging()) {
            return false;
        }
        const sourceType = this.registry.getSourceType(sourceId);
        const draggedItemType = this.getItemType();
        if (sourceType !== draggedItemType) {
            return false;
        }
        return source.isDragging(this, sourceId);
    }
    getItemType() {
        return this.store.getState().dragOperation.itemType;
    }
    getItem() {
        return this.store.getState().dragOperation.item;
    }
    getSourceId() {
        return this.store.getState().dragOperation.sourceId;
    }
    getTargetIds() {
        return this.store.getState().dragOperation.targetIds;
    }
    constructor(store, registry){
        this.store = store;
        this.registry = registry;
    }
}
