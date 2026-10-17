import { useContext, useEffect, useLayoutEffect, useMemo } from 'preact/hooks';
import { useCollector } from './collector';
import { DndContext } from './context';

const isRef = (obj) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, 'current');

class DropTargetImpl {
    constructor(spec, monitor) {
        this.spec = spec;
        this.monitor = monitor;
    }

    hover() {
        const { hover } = this.spec;
        if (hover) hover(this.monitor.getItem(), this.monitor);
    }

    drop() {
        const { drop } = this.spec;
        if (drop) return drop(this.monitor.getItem(), this.monitor);
    }
}

class DropTargetMonitorImpl {
    constructor(manager) {
        this.targetId = null;
        this.internalMonitor = manager.getMonitor();
    }

    receiveHandlerId(targetId) {
        this.targetId = targetId;
    }

    getHandlerId() {
        return this.targetId;
    }

    subscribeToStateChange(listener) {
        return this.internalMonitor.subscribeToStateChange(listener);
    }

    getItemType() {
        return this.internalMonitor.getItemType();
    }

    getItem() {
        return this.internalMonitor.getItem();
    }
}

class TargetConnector {
    constructor(backend) {
        this.dropTarget = (node) => {
            this.dropTargetRef = null;
            this.dropTargetNode = null;
            if (isRef(node)) this.dropTargetRef = node;
            else this.dropTargetNode = node;
            this.reconnect();
        };
        this.handlerId = null;
        this.dropTargetRef = null;
        this.lastConnectedHandlerId = null;
        this.lastConnectedDropTarget = null;
        this.backend = backend;
    }

    receiveHandlerId(newHandlerId) {
        if (newHandlerId === this.handlerId) return;
        this.handlerId = newHandlerId;
        this.reconnect();
    }

    reconnect() {
        const dropTarget = this.dropTargetNode || this.dropTargetRef && this.dropTargetRef.current;
        const didChange = this.lastConnectedHandlerId !== this.handlerId || this.lastConnectedDropTarget !== dropTarget;
        if (didChange) this.disconnectDropTarget();
        if (!this.handlerId) return;
        if (!dropTarget) {
            this.lastConnectedDropTarget = dropTarget;
            return;
        }
        if (didChange) {
            this.lastConnectedHandlerId = this.handlerId;
            this.lastConnectedDropTarget = dropTarget;
            this.unsubscribeDropTarget = this.backend.connectDropTarget(this.handlerId, dropTarget);
        }
    }

    disconnectDropTarget() {
        if (this.unsubscribeDropTarget) {
            this.unsubscribeDropTarget();
            this.unsubscribeDropTarget = undefined;
        }
    }
}

function useDropTarget(spec, monitor) {
    const dropTarget = useMemo(() => new DropTargetImpl(spec, monitor), [
        monitor
    ]);
    useEffect(() => {
        dropTarget.spec = spec;
    }, [
        dropTarget,
        spec
    ]);
    return dropTarget;
}

function useRegisteredDropTarget(spec, monitor, connector, manager) {
    const dropTarget = useDropTarget(spec, monitor);
    const accept = Array.isArray(spec.accept) ? spec.accept : [
        spec.accept
    ];
    useLayoutEffect(function registerDropTarget() {
        const registry = manager.getRegistry();
        const handlerId = registry.addTarget(accept, dropTarget);
        monitor.receiveHandlerId(handlerId);
        connector.receiveHandlerId(handlerId);
        return () => registry.removeTarget(handlerId);
    }, [
        manager,
        monitor,
        dropTarget,
        connector,
        accept.map((a) => a.toString()).join('|'),
    ]);
}

export function useDrop(spec) {
    const { dragDropManager: manager } = useContext(DndContext);
    const monitor = useMemo(() => new DropTargetMonitorImpl(manager), [manager]);
    const connector = useMemo(() => new TargetConnector(manager.getBackend()), [manager]);
    useLayoutEffect(() => {
        connector.reconnect();
        return () => connector.disconnectDropTarget();
    }, []);
    useRegisteredDropTarget(spec, monitor, connector, manager);
    return [
        useCollector(monitor, spec.collect, connector),
        connector.dropTarget,
    ];
}
