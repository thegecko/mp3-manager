import { useCallback, useLayoutEffect, useState } from 'preact/hooks';

function shallowEqual(a, b) {
    if (a === b) return true;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) => a[key] === b[key]);
}

export function useCollector(monitor, collect, connector) {
    collect = collect || (() => ({}));
    const [collected, setCollected] = useState(() => collect(monitor));
    const updateCollected = useCallback(() => {
        const nextValue = collect(monitor);
        if (!shallowEqual(collected, nextValue)) {
            setCollected(nextValue);
            connector.reconnect();
        }
    }, [
        collected,
        monitor,
        connector
    ]);
    useLayoutEffect(updateCollected);
    useLayoutEffect(function subscribeToMonitorStateChange() {
        const handlerId = monitor.getHandlerId();
        if (handlerId == null) return;
        return monitor.subscribeToStateChange(updateCollected);
    }, [monitor, updateCollected]);
    return collected;
}
