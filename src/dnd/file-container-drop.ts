import { useEffect } from 'preact/hooks';
import { useDrop } from './use-drop';
import { NativeTypes } from './html5-backend';

export interface FileContainerDropOptions {
    onNew: () => any;
    clearNew: () => void;
}

export const useFileContainerDrop = (options: FileContainerDropOptions) => {
    const { onNew, clearNew } = options;

    useEffect(() => {
        const clear = () => clearNew();
        const onDragLeave = (event: DragEvent) => {
            if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
                clear();
            }
        };

        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('dragend', clear);
        window.addEventListener('drop', clear);
        return () => {
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('dragend', clear);
            window.removeEventListener('drop', clear);
        };
    }, [clearNew]);

    const [, connectDrop] = useDrop({
        accept: NativeTypes.FILE,
        hover(item: any, monitor) {
            if (!item.id && monitor.getItemType() === NativeTypes.FILE) {
                item.id = onNew();
            }
        },
        collect: (monitor) => {
            if (!monitor.getItemType()) {
                clearNew();
            }
        }
    });

    return connectDrop;
};
