const FILE = '__NATIVE_FILE__';
export const NativeTypes = {
    FILE
};
class FileDragSource {
    beginDrag() {
        return this.item;
    }
    isDragging(monitor, handle) {
        return handle === monitor.getSourceId();
    }
    endDrag() {}
    loadDataTransfer(dataTransfer) {
        if (dataTransfer) {
            Object.defineProperties(this.item, {
                files: { value: Array.prototype.slice.call(dataTransfer.files), configurable: true, enumerable: true },
                items: { value: dataTransfer.items, configurable: true, enumerable: true },
                dataTransfer: { value: dataTransfer, configurable: true, enumerable: true }
            });
        }
    }
    constructor(){
        this.item = {};
    }
}
function createNativeDragSource(type, dataTransfer) {
    if (type !== FILE) throw new Error(`native type ${type} has no configuration`);
    const result = new FileDragSource();
    result.loadDataTransfer(dataTransfer);
    return result;
}
function matchNativeItemType(dataTransfer) {
    if (!dataTransfer) return null;
    return Array.prototype.slice.call(dataTransfer.types || []).indexOf('Files') > -1 ? FILE : null;
}
class EnterLeaveCounter {
    enter(node) {
        const previousLength = this.entered.length;
        this.entered = this.entered.filter((item)=>this.isNodeInDocument(item) && (!item.contains || item.contains(node)));
        if (this.entered.indexOf(node) < 0) this.entered.push(node);
        return previousLength === 0 && this.entered.length > 0;
    }
    leave(node) {
        const previousLength = this.entered.length;
        this.entered = this.entered.filter((item)=>this.isNodeInDocument(item) && item !== node);
        return previousLength > 0 && this.entered.length === 0;
    }
    reset() {
        this.entered = [];
    }
    constructor(isNodeInDocument){
        this.entered = [];
        this.isNodeInDocument = isNodeInDocument;
    }
}
export class HTML5BackendImpl {
    setup() {
        if (window.__isReactDndBackendSetUp) {
            throw new Error('Cannot have two HTML5 backends at the same time.');
        }
        window.__isReactDndBackendSetUp = true;
        this.addEventListeners(window);
    }
    connectDragSource(sourceId, node) {
        const handleDragStart = (e)=>this.handleDragStart(e, sourceId)
        ;
        node.setAttribute('draggable', 'true');
        node.addEventListener('dragstart', handleDragStart);
        return ()=>{
            node.removeEventListener('dragstart', handleDragStart);
            node.setAttribute('draggable', 'false');
        };
    }
    connectDropTarget(targetId, node) {
        const handleDragEnter = (e)=>this.handleDragEnter(e, targetId)
        ;
        const handleDragOver = (e)=>this.handleDragOver(e, targetId)
        ;
        const handleDrop = (e)=>this.handleDrop(e, targetId)
        ;
        node.addEventListener('dragenter', handleDragEnter);
        node.addEventListener('dragover', handleDragOver);
        node.addEventListener('drop', handleDrop);
        return ()=>{
            node.removeEventListener('dragenter', handleDragEnter);
            node.removeEventListener('dragover', handleDragOver);
            node.removeEventListener('drop', handleDrop);
        };
    }
    addEventListeners(target) {
        target.addEventListener('dragstart', this.handleTopDragStart);
        target.addEventListener('dragstart', this.handleTopDragStartCapture, true);
        target.addEventListener('dragend', this.handleTopDragEndCapture, true);
        target.addEventListener('dragenter', this.handleTopDragEnter);
        target.addEventListener('dragenter', this.handleTopDragEnterCapture, true);
        target.addEventListener('dragleave', this.handleTopDragLeaveCapture, true);
        target.addEventListener('dragover', this.handleTopDragOver);
        target.addEventListener('dragover', this.handleTopDragOverCapture, true);
        target.addEventListener('drop', this.handleTopDrop);
        target.addEventListener('drop', this.handleTopDropCapture, true);
    }
    getCurrentDropEffect() {
        if (this.isDraggingNativeItem()) {
            // It makes more sense to default to 'copy' for native resources
            return 'copy';
        }
        return 'move';
    }
    isDraggingNativeItem() {
        const itemType = this.monitor.getItemType();
        return itemType === FILE;
    }
    beginDragNativeItem(type, dataTransfer) {
        this.clearCurrentDragSourceNode();
        this.currentNativeSource = createNativeDragSource(type, dataTransfer);
        this.currentNativeHandle = this.registry.addSource(type, this.currentNativeSource);
        this.actions.beginDrag([
            this.currentNativeHandle
        ]);
    }
    setCurrentDragSourceNode(node) {
        this.clearCurrentDragSourceNode();
        this.currentDragSourceNode = node;
        // A timeout of > 0 is necessary to resolve Firefox issue referenced
        // See:
        //   * https://github.com/react-dnd/react-dnd/pull/928
        //   * https://github.com/react-dnd/react-dnd/issues/869
        const MOUSE_MOVE_TIMEOUT = 1000;
        // Receiving a mouse event in the middle of a dragging operation
        // means it has ended and the drag source node disappeared from DOM,
        // so the browser didn't dispatch the dragend event.
        //
        // We need to wait before we start listening for mousemove events.
        // This is needed because the drag preview needs to be drawn or else it fires an 'mousemove' event
        // immediately in some browsers.
        //
        // See:
        //   * https://github.com/react-dnd/react-dnd/pull/928
        //   * https://github.com/react-dnd/react-dnd/issues/869
        //
        this.mouseMoveTimeoutTimer = setTimeout(()=>{
            window.addEventListener('mousemove', this.endDragIfSourceWasRemovedFromDOM, true);
        }, MOUSE_MOVE_TIMEOUT);
    }
    clearCurrentDragSourceNode() {
        if (this.currentDragSourceNode) {
            this.currentDragSourceNode = null;
            clearTimeout(this.mouseMoveTimeoutTimer || undefined);
            window.removeEventListener('mousemove', this.endDragIfSourceWasRemovedFromDOM, true);
            this.mouseMoveTimeoutTimer = null;
            return true;
        }
        return false;
    }
    handleDragStart(e, sourceId) {
        if (e.defaultPrevented) {
            return;
        }
        if (!this.dragStartSourceIds) {
            this.dragStartSourceIds = [];
        }
        this.dragStartSourceIds.unshift(sourceId);
    }
    handleDragEnter(_e, targetId) {
        this.dragEnterTargetIds.unshift(targetId);
    }
    handleDragOver(_e, targetId) {
        if (this.dragOverTargetIds === null) {
            this.dragOverTargetIds = [];
        }
        this.dragOverTargetIds.unshift(targetId);
    }
    handleDrop(_e, targetId) {
        this.dropTargetIds.unshift(targetId);
    }
    constructor(manager){
        this.dragStartSourceIds = null;
        this.dropTargetIds = [];
        this.dragEnterTargetIds = [];
        this.currentNativeSource = null;
        this.currentNativeHandle = null;
        this.currentDragSourceNode = null;
        this.mouseMoveTimeoutTimer = null;
        this.dragOverTargetIds = null;
        this.hoverRafId = null;
        this.endDragNativeItem = ()=>{
            if (!this.isDraggingNativeItem()) {
                return;
            }
            this.actions.endDrag();
            if (this.currentNativeHandle) {
                this.registry.removeSource(this.currentNativeHandle);
            }
            this.currentNativeHandle = null;
            this.currentNativeSource = null;
        };
        this.isNodeInDocument = (node)=>{
            return Boolean(node && document.body && document.body.contains(node));
        };
        this.endDragIfSourceWasRemovedFromDOM = ()=>{
            const node = this.currentDragSourceNode;
            if (node == null || this.isNodeInDocument(node)) {
                return;
            }
            if (this.clearCurrentDragSourceNode() && this.monitor.isDragging()) {
                this.actions.endDrag();
            }
            this.cancelHover();
        };
        this.scheduleHover = (dragOverTargetIds)=>{
            if (this.hoverRafId === null && typeof requestAnimationFrame !== 'undefined') {
                this.hoverRafId = requestAnimationFrame(()=>{
                    if (this.monitor.isDragging()) {
                        this.actions.hover(dragOverTargetIds || []);
                    }
                    this.hoverRafId = null;
                });
            }
        };
        this.cancelHover = ()=>{
            if (this.hoverRafId !== null && typeof cancelAnimationFrame !== 'undefined') {
                cancelAnimationFrame(this.hoverRafId);
                this.hoverRafId = null;
            }
        };
        this.handleTopDragStartCapture = ()=>{
            this.clearCurrentDragSourceNode();
            this.dragStartSourceIds = [];
        };
        this.handleTopDragStart = (e)=>{
            if (e.defaultPrevented) {
                return;
            }
            const { dragStartSourceIds  } = this;
            this.dragStartSourceIds = null;
            // Avoid crashing if we missed a drop event or our previous drag died
            if (this.monitor.isDragging()) {
                this.actions.endDrag();
                this.cancelHover();
            }
            // Don't publish the source just yet (see why below)
            this.actions.beginDrag(dragStartSourceIds || []);
            const { dataTransfer  } = e;
            const nativeType = matchNativeItemType(dataTransfer);
            if (this.monitor.isDragging()) {
                try {
                    // Firefox won't drag without setting data
                    dataTransfer === null || dataTransfer === void 0 ? void 0 : dataTransfer.setData('application/json', {});
                } catch (err) {
                // IE doesn't support MIME types in setData
                }
                // Store drag source node so we can check whether
                // it is removed from DOM and trigger endDrag manually.
                this.setCurrentDragSourceNode(e.target);
                // Now we are ready to publish the drag source.. or are we not?
            } else if (nativeType) {
                // A native item (such as URL) dragged from inside the document
                this.beginDragNativeItem(nativeType);
            } else if (dataTransfer && !dataTransfer.types && (e.target && !e.target.hasAttribute || !e.target.hasAttribute('draggable'))) {
                // Looks like a Safari bug: dataTransfer.types is null, but there was no draggable.
                // Just let it drag. It's a native type (URL or text) and will be picked up in
                // dragenter handler.
                return;
            } else {
                // If by this time no drag source reacted, tell browser not to drag.
                e.preventDefault();
            }
        };
        this.handleTopDragEndCapture = ()=>{
            if (this.clearCurrentDragSourceNode() && this.monitor.isDragging()) {
                // Firefox can dispatch this event in an infinite loop
                // if dragend handler does something like showing an alert.
                // Only proceed if we have not handled it already.
                this.actions.endDrag();
            }
            this.cancelHover();
        };
        this.handleTopDragEnterCapture = (e)=>{
            this.dragEnterTargetIds = [];
            if (this.isDraggingNativeItem()) {
                var ref;
                (ref = this.currentNativeSource) === null || ref === void 0 ? void 0 : ref.loadDataTransfer(e.dataTransfer);
            }
            const isFirstEnter = this.enterLeaveCounter.enter(e.target);
            if (!isFirstEnter || this.monitor.isDragging()) {
                return;
            }
            const { dataTransfer  } = e;
            const nativeType = matchNativeItemType(dataTransfer);
            if (nativeType) {
                // A native item (such as file or URL) dragged from outside the document
                this.beginDragNativeItem(nativeType, dataTransfer);
            }
        };
        this.handleTopDragEnter = (e)=>{
            const { dragEnterTargetIds  } = this;
            this.dragEnterTargetIds = [];
            if (!this.monitor.isDragging()) {
                // This is probably a native item type we don't understand.
                return;
            }
            // If the target changes position as the result of `dragenter`, `dragover` might still
            // get dispatched despite target being no longer there. The easy solution is to check
            // whether there actually is a target before firing `hover`.
            if (dragEnterTargetIds.length > 0) {
                this.actions.hover(dragEnterTargetIds);
            }
            const canDrop = dragEnterTargetIds.some((targetId)=>this.monitor.canDropOnTarget(targetId)
            );
            if (canDrop) {
                // IE requires this to fire dragover events
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = this.getCurrentDropEffect();
                }
            }
        };
        this.handleTopDragOverCapture = (e)=>{
            this.dragOverTargetIds = [];
            if (this.isDraggingNativeItem()) {
                var ref;
                (ref = this.currentNativeSource) === null || ref === void 0 ? void 0 : ref.loadDataTransfer(e.dataTransfer);
            }
        };
        this.handleTopDragOver = (e)=>{
            const { dragOverTargetIds  } = this;
            this.dragOverTargetIds = [];
            if (!this.monitor.isDragging()) {
                // This is probably a native item type we don't understand.
                // Prevent default "drop and blow away the whole document" action.
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'none';
                }
                return;
            }
            this.scheduleHover(dragOverTargetIds);
            const canDrop = (dragOverTargetIds || []).some((targetId)=>this.monitor.canDropOnTarget(targetId)
            );
            if (canDrop) {
                // Show user-specified drop effect.
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = this.getCurrentDropEffect();
                }
            } else if (this.isDraggingNativeItem()) {
                // Don't show a nice cursor but still prevent default
                // "drop and blow away the whole document" action.
                e.preventDefault();
            } else {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'none';
                }
            }
        };
        this.handleTopDragLeaveCapture = (e)=>{
            if (this.isDraggingNativeItem()) {
                e.preventDefault();
            }
            const isLastLeave = this.enterLeaveCounter.leave(e.target);
            if (!isLastLeave) {
                return;
            }
            if (this.isDraggingNativeItem()) {
                setTimeout(()=>this.endDragNativeItem()
                , 0);
            }
            this.cancelHover();
        };
        this.handleTopDropCapture = (e)=>{
            this.dropTargetIds = [];
            if (this.isDraggingNativeItem()) {
                var ref;
                e.preventDefault();
                (ref = this.currentNativeSource) === null || ref === void 0 ? void 0 : ref.loadDataTransfer(e.dataTransfer);
            } else if (matchNativeItemType(e.dataTransfer)) {
                // Dragging some elements, like <a> and <img> may still behave like a native drag event,
                // even if the current drag event matches a user-defined type.
                // Stop the default behavior when we're not expecting a native item to be dropped.
                e.preventDefault();
            }
            this.enterLeaveCounter.reset();
        };
        this.handleTopDrop = (e)=>{
            const { dropTargetIds  } = this;
            this.dropTargetIds = [];
            this.actions.hover(dropTargetIds);
            this.actions.drop();
            if (this.isDraggingNativeItem()) {
                this.endDragNativeItem();
            } else if (this.monitor.isDragging()) {
                this.actions.endDrag();
            }
            this.cancelHover();
        };
        this.actions = manager.getActions();
        this.monitor = manager.getMonitor();
        this.registry = manager.getRegistry();
        this.enterLeaveCounter = new EnterLeaveCounter(this.isNodeInDocument);
    }
}

export const HTML5Backend = function createBackend(manager: any) {
    return new HTML5BackendImpl(manager);
};
