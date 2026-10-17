import { useContext, useEffect, useLayoutEffect, useMemo } from 'preact/hooks';
import { useCollector } from './collector';
import { DndContext } from './context';

const isRef = (obj) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, 'current');

class DragSourceImpl {
    constructor(spec, monitor, connector) {
        this.spec = spec;
        this.monitor = monitor;
        this.connector = connector;
    }

    beginDrag() {
        const { item } = this.spec;
        const result = typeof item === 'object' ? item : typeof item === 'function' ? item(this.monitor) : {};
        return result ?? null;
    }

    isDragging(globalMonitor, target) {
        return target === globalMonitor.getSourceId();
    }

    endDrag() {
        const { end } = this.spec;
        if (end) end();
        this.connector.reconnect();
    }
}

class DragSourceMonitorImpl {
    constructor(manager) {
        this.sourceId = null;
        this.internalMonitor = manager.getMonitor();
    }

    receiveHandlerId(sourceId) {
        this.sourceId = sourceId;
    }

    getHandlerId() {
        return this.sourceId;
    }

    isDragging() {
        return this.sourceId ? this.internalMonitor.isDraggingSource(this.sourceId) : false;
    }

    subscribeToStateChange(listener) {
        return this.internalMonitor.subscribeToStateChange(listener);
    }
}

class SourceConnector {
    constructor(backend) {
        this.dragSource = (node) => {
            this.dragSourceNode = null;
            this.dragSourceRef = null;
            if (isRef(node)) this.dragSourceRef = node;
            else this.dragSourceNode = node;
            this.reconnect();
        };
        this.handlerId = null;
        this.dragSourceRef = null;
        this.lastConnectedHandlerId = null;
        this.lastConnectedDragSource = null;
        this.backend = backend;
    }

    receiveHandlerId(newHandlerId) {
        if (this.handlerId === newHandlerId) return;
        this.handlerId = newHandlerId;
        this.reconnect();
    }

    reconnect() {
        const dragSource = this.dragSourceNode || this.dragSourceRef && this.dragSourceRef.current;
        const didChange = this.lastConnectedHandlerId !== this.handlerId || this.lastConnectedDragSource !== dragSource;
        if (didChange) this.disconnectDragSource();
        if (!this.handlerId) return;
        if (!dragSource) {
            this.lastConnectedDragSource = dragSource;
            return;
        }
        if (didChange) {
            this.lastConnectedHandlerId = this.handlerId;
            this.lastConnectedDragSource = dragSource;
            this.dragSourceUnsubscribe = this.backend.connectDragSource(this.handlerId, dragSource);
        }
    }

    disconnectDragSource() {
        if (this.dragSourceUnsubscribe) {
            this.dragSourceUnsubscribe();
            this.dragSourceUnsubscribe = undefined;
        }
    }
}

function useDragSource(spec, monitor, connector) {
    const handler = useMemo(() => new DragSourceImpl(spec, monitor, connector), [
        monitor,
        connector
    ]);
    useEffect(() => {
        handler.spec = spec;
    }, [
        handler,
        spec
    ]);
    return handler;
}

function useRegisteredDragSource(spec, monitor, connector, manager) {
    const handler = useDragSource(spec, monitor, connector);
    const itemType = spec.type;
    useLayoutEffect(function registerDragSource() {
        if (itemType != null) {
            const registry = manager.getRegistry();
            const handlerId = registry.addSource(itemType, handler);
            monitor.receiveHandlerId(handlerId);
            connector.receiveHandlerId(handlerId);
            return () => registry.removeSource(handlerId);
        }
        return;
    }, [
        manager,
        monitor,
        connector,
        handler,
        itemType
    ]);
}

export function useDrag(spec) {
    const { dragDropManager: manager } = useContext(DndContext);
    const monitor = useMemo(() => new DragSourceMonitorImpl(manager), [manager]);
    const connector = useMemo(() => new SourceConnector(manager.getBackend()), [manager]);
    useLayoutEffect(() => {
        connector.reconnect();
        return () => connector.disconnectDragSource();
    }, [connector]);
    useRegisteredDragSource(spec, monitor, connector, manager);
    return [
        useCollector(monitor, spec.collect, connector),
        connector.dragSource,
    ];
}
