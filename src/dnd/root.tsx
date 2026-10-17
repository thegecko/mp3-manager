import type { ComponentChildren } from 'preact';
import { createDragDropManager } from './drag-drop-manager';
import { DndContext } from './context';
import { HTML5Backend } from './html5-backend';

let manager: any;

export const DndRoot = ({ children }: { children: ComponentChildren }) => (
    <DndContext.Provider value={manager || (manager = { dragDropManager: createDragDropManager(HTML5Backend) })}>
        {children}
    </DndContext.Provider>
);
